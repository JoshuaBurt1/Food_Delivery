import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  GeoPoint,
  doc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Navigate } from "react-router-dom";

import { MapContainer, TileLayer, Marker, Popup, useMap} from "react-leaflet";
import L from "leaflet";

// MAP VIEW: React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function ChangeMapView({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
}

// ADDRESS to GEOLOCATION: OpenCage API
async function geocodeAddress(address) {
  const apiKey = "183a5a8cb47547249e4b3a3a44e9e24f";
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(
    address
  )}&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry;
      return { lat, lng };
    } else {
      throw new Error("No results found.");
    }
  } catch (err) {
    console.error("Geocoding failed:", err);
    throw err;
  }
}

export default function UserPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState([]);
  const [userData, setUserData] = useState(null);
  const [fetchingUser, setFetchingUser] = useState(true);
  const [error, setError] = useState(null);
  const [addressInput, setAddressInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch or create user document
  useEffect(() => {
    if (!user) return;

    const usersRef = collection(db, "users");

    const fetchOrCreateUser = async () => {
      try {
        const snapshot = await getDocs(usersRef);

        const matchedDoc = snapshot.docs.find((doc) => {
          const data = doc.data();
          const emailMatch = data.email === user.email;
          const nameMatch =
            data.name?.toLowerCase().trim() ===
            user.displayName?.toLowerCase().trim();
          return emailMatch || nameMatch;
        });

        if (matchedDoc) {
          const userDoc = { id: matchedDoc.id, ...matchedDoc.data() };
          setUserData(userDoc);
          setAddressInput(userDoc.address || "");
          setFetchingUser(false);
          return;
        }

        const newUser = {
          email: user.email,
          name: user.displayName || "Unnamed User",
          createdAt: new Date(),
          deliveryLocation: new GeoPoint(90, 90),
          address: "",
        };

        const docRef = await addDoc(usersRef, newUser);
        await updateDoc(docRef, { userId: docRef.id });

        setUserData({ id: docRef.id, userId: docRef.id, ...newUser });
        setAddressInput("");
        setFetchingUser(false);
      } catch (err) {
        console.error("Error fetching or creating user:", err);
        setError("Something went wrong while setting up your user profile.");
        setFetchingUser(false);
      }
    };

    fetchOrCreateUser();
  }, [user]);

  // Fetch restaurants
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const snap = await getDocs(collection(db, "restaurants"));
        setRestaurants(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching restaurants:", err);
      }
    })();
  }, [user]);

  // Handle address update form submit
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!userData) return;

    if (!addressInput.trim()) {
      alert("Please enter your address.");
      return;
    }

    setSavingProfile(true);
    setError(null);

    try {
      const { lat, lng } = await geocodeAddress(addressInput.trim());

      const userRef = doc(db, "users", userData.id);
      const updatedFields = {
        address: addressInput.trim(),
        deliveryLocation: new GeoPoint(lat, lng),
      };

      await updateDoc(userRef, updatedFields);

      setUserData((prev) => ({
        ...prev,
        ...updatedFields,
      }));
      alert("Address updated successfully!");
    } catch (err) {
      setError("Failed to geocode address. Please try a different one.");
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading || fetchingUser) return <div>Loading...</div>;

  if (error)
    return (
      <div className="p-6 text-red-600 font-semibold">
        Error: {error}
      </div>
    );

  if (!user) return <Navigate to="/login" />;

  // Get lat/lng from userData.deliveryLocation or fallback to default coords
  const userLatLng =
    userData?.deliveryLocation
      ? [userData.deliveryLocation.latitude, userData.deliveryLocation.longitude]
      : [51.505, -0.09]; // London as fallback
  console.log("userLatLng coords:", userLatLng);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user.displayName} (User)
      </h1>

      <table className="w-full table-fixed border border-gray-300 mt-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left px-4 py-2 border-b w-1/6">Field</th>
            <th className="text-left px-4 py-2 border-b w-1/3">Value</th>
            <th className="text-left px-4 py-2 border-b w-1/6">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-4 py-2 border-b align-top">Name</td>
            <td className="px-4 py-2 border-b" colSpan={2}>
              {userData?.name || user.displayName}
            </td>
          </tr>
          <tr>
            <td className="px-4 py-2 border-b align-top">Email</td>
            <td className="px-4 py-2 border-b" colSpan={2}>
              {userData?.email || user.email}
            </td>
          </tr>
          <tr>
            <td className="px-4 py-2 border-b align-top">Address</td>
            <td className="px-4 py-2 border-b">
              <form onSubmit={handleProfileSubmit}>
                <input
                  type="text"
                  className="border px-4 py-2 text-base rounded w-full max-w-[60ch]"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="123 Main St, City, Country"
                />
              </form>
            </td>
            <td className="px-4 py-2 border-b align-top">
              <button
                onClick={handleProfileSubmit}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full"
                disabled={savingProfile}
              >
                {savingProfile ? "Saving..." : "Update"}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="h-[500px] w-full rounded overflow-hidden border border-gray-300 mt-4">
        <MapContainer
          center={userLatLng}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: "300px", width: "300px" }}
        >
          <ChangeMapView center={userLatLng} />
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={userLatLng}>
            <Popup>Your delivery location</Popup>
          </Marker>
        </MapContainer>
      </div>

      <h2 className="mt-8 text-xl">Nearby Restaurants</h2>
      <ul className="mt-2 space-y-2">
        {restaurants.map((r) => (
          <li key={r.id} className="border p-2 rounded shadow">
            <h3 className="font-semibold">{r.name}</h3>
            <p>{r.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}



/* 
User can select multiple restaurants. Show the restaurant locations on the map with markers.
On restaurant selection, food item choice selection

Message system to admin team if excessive wait time
Status updates from system (admin has contacted courier, admin has changed courier, estimated wait time)
System updates from courier (waiting for restaurant, assistance button pressed)
*/