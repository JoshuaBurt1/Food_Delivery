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

const restaurantIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1046/1046784.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32], // half width, full height
  popupAnchor: [0, -32], // position popup above icon
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  shadowSize: [41, 41],
  shadowAnchor: [13, 41],
});

function FitBoundsView({ markers }) {
  const map = useMap();
  const [hasFit, setHasFit] = useState(false);

  useEffect(() => {
    if (!markers.length || hasFit) return;

    const bounds = L.latLngBounds(markers);
    map.fitBounds(bounds, { padding: [50, 50] });
    setHasFit(true);
  }, [map, markers, hasFit]);

  return null;
}

function ZoomToRadius({ setSearchRadius, setMapInstance }) {
  const map = useMap();

  useEffect(() => {
    setMapInstance(map); // so we can access it outside too

    function handleZoom() {
      const zoom = map.getZoom();

      // Approximate radius formula based on zoom level
      const radius = zoomLevelToKm(zoom);
      setSearchRadius(radius);
    }

    map.on("zoomend", handleZoom);
    handleZoom(); // Run once on mount

    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [map, setSearchRadius, setMapInstance]);

  return null;
}

function zoomLevelToKm(zoom) {
  // Leaflet zoom level to radius (km)
  const zoomToKm = {
    8: 100,
    9: 75,
    10: 50,
    11: 25,
    12: 10,
    13: 5,
    14: 2.5,
    15: 1.5,
    16: 1,
    17: 0.5,
    18: 0.25,
  };
  const radius = zoomToKm[zoom] || 100;
  return Math.min(radius, 100); // restaurants will not show over 100km from address
}

function MapSetTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.setView(position, map.getZoom()); 
    }
  }, [position, map]);
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

// DISTANCE CALCULATION (User to restaurant)
function getDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(2); // distance in km, rounded to 2 decimals
}

// RESTAURANT OPEN TIMES
function isRestaurantOpenToday(hoursArray, now = new Date()) {
  const days = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
  ];
  const today = days[now.getDay()];

  const todayEntry = hoursArray.find((entry) => entry[today]);
  if (!todayEntry || !todayEntry[today]) return false;

  const { Opening, Closing } = todayEntry[today];

  if (!Opening || !Closing || Opening.length !== 4 || Closing.length !== 4) {
    return false;
  }

  const openHour = parseInt(Opening.slice(0, 2), 10);
  const openMinute = parseInt(Opening.slice(2), 10);
  const closeHour = parseInt(Closing.slice(0, 2), 10);
  const closeMinute = parseInt(Closing.slice(2), 10);

  const openTime = new Date(now);
  openTime.setHours(openHour, openMinute, 0, 0);

  const closeTime = new Date(now);
  closeTime.setHours(closeHour, closeMinute, 0, 0);

  if (closeTime <= openTime) {
    // Overnight shift — close is technically next day
    const closeTimeNextDay = new Date(closeTime);
    closeTimeNextDay.setDate(closeTimeNextDay.getDate() + 1);

    // Now is between opening and midnight → open
    if (now >= openTime) {
      return now <= closeTimeNextDay;
    }

    // Now is after midnight but before close → still open
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayEntry = hoursArray.find((entry) => entry[days[yesterday.getDay()]]);
    if (!yesterdayEntry || !yesterdayEntry[days[yesterday.getDay()]]) return false;

    const { Opening: yOpen, Closing: yClose } = yesterdayEntry[days[yesterday.getDay()]];
    if (!yOpen || !yClose || yOpen.length !== 4 || yClose.length !== 4) return false;

    const yOpenHour = parseInt(yOpen.slice(0, 2), 10);
    const yOpenMinute = parseInt(yOpen.slice(2), 10);
    const yCloseHour = parseInt(yClose.slice(0, 2), 10);
    const yCloseMinute = parseInt(yClose.slice(2), 10);

    const yOpenTime = new Date(now);
    yOpenTime.setDate(now.getDate() - 1);
    yOpenTime.setHours(yOpenHour, yOpenMinute, 0, 0);

    const yCloseTime = new Date(now);
    yCloseTime.setHours(yCloseHour, yCloseMinute, 0, 0);

    if (yCloseTime <= yOpenTime) {
      yCloseTime.setDate(yCloseTime.getDate() + 1); // make close time next day
    }

    return now >= yOpenTime && now <= yCloseTime;
  }

  // Normal same-day hours
  return now >= openTime && now <= closeTime;
}

function formatTime(timeStr) {
  if (!timeStr || timeStr.length !== 4) return "Invalid";
  const hours = timeStr.slice(0, 2);
  const minutes = timeStr.slice(2);
  return `${hours}:${minutes}`;
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
  const [expandedRestaurantId, setExpandedRestaurantId] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [searchRadius, setSearchRadius] = useState(25); // default 25 km search radius
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [userLatLng, setUserLatLng] = useState([44.413922, -79.707506]); // Georgian Mall Family Dental as fallback

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

    // Time updated every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
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

          // Set lat/lng if available
          if (userDoc.deliveryLocation) {
            setUserLatLng([
              userDoc.deliveryLocation.latitude,
              userDoc.deliveryLocation.longitude,
            ]);
          }

          setAddressInput(userDoc.address || "");
          setFetchingUser(false);
          return;
        }

        const newUser = {
          email: user.email,
          name: user.displayName || "Unnamed User",
          createdAt: new Date(),
          deliveryLocation: new GeoPoint(90, 0),
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

      // Update Firestore
      const userRef = doc(db, "users", userData.id);
      const updatedFields = {
        address: addressInput.trim(),
        deliveryLocation: new GeoPoint(lat, lng),
      };
      await updateDoc(userRef, updatedFields);

      // Update local state
      setUserData((prev) => ({
        ...prev,
        ...updatedFields,
      }));
      setUserLatLng([lat, lng]); // ⬅️ this updates the map
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

  const restaurantsWithinRange = restaurants
  .map((r) => {
    const rLat = r.location?.latitude;
    const rLng = r.location?.longitude;

    if (!rLat || !rLng) return null;

    const distance = getDistanceInKm(userLatLng[0], userLatLng[1], rLat, rLng);
    return { ...r, distance: parseFloat(distance) };
  })
  .filter((r) => r && r.distance <= searchRadius);

  const groupedByType = restaurantsWithinRange.reduce((acc, r) => {
    const type = r.type || "Other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  const sortedTypes = Object.keys(groupedByType).sort();

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
          <MapSetTo position={userLatLng} />
          <ZoomToRadius
            setSearchRadius={setSearchRadius}
            setMapInstance={setMapInstance}
          />
          <FitBoundsView
            markers={[
              userLatLng,
              ...restaurantsWithinRange.map((r) => [
                r.location.latitude,
                r.location.longitude,
              ]),
            ]}
          />
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={userLatLng}>
            <Popup>Your delivery location</Popup>
          </Marker>

          {restaurantsWithinRange.map((r) => (
            <Marker
              key={r.id}
              position={[r.location.latitude, r.location.longitude]}
              icon={restaurantIcon}
            >
              <Popup>
                <strong>{r.storeName}</strong>
                <br />
                {r.address}
                <br />
                {r.distance.toFixed(2)} km away
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <h2 className="mt-8 text-xl">Nearby Open Restaurants within {searchRadius} km</h2>
      <div className="mt-4 space-y-6">
        {sortedTypes.map((type) => (
          <div key={type}>
            <h3 className="text-lg font-semibold mb-2">{type}</h3>
            <ul className="space-y-2">
              {groupedByType[type].map((r) => {
                const rLat = r.location?.latitude;
                const rLng = r.location?.longitude;
                const distance = (rLat && rLng)
                  ? getDistanceInKm(userLatLng[0], userLatLng[1], rLat, rLng)
                  : null;
                const isExpanded = expandedRestaurantId === r.id;

                return (
                  <li
                    key={r.id}
                    className="border p-2 rounded shadow cursor-pointer"
                    onClick={() => setExpandedRestaurantId(isExpanded ? null : r.id)}
                  >
                    <h4 className="font-semibold">
                      {r.storeName}
                      {distance ? (
                        <span className="text-sm text-gray-600">
                          {" "}— {distance} km away
                        </span>
                      ) : (
                        <span className="text-sm text-red-600">
                          {" "}— Location missing
                        </span>
                      )}
                    </h4>
                    <p className="text-sm text-gray-700">{r.address}</p>
                    <p className="font-semibold">
                      {r.hours && (
                        <>
                          <span
                            className={`ml-2 text-sm font-medium ${
                              isRestaurantOpenToday(r.hours, currentDateTime)
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {isRestaurantOpenToday(r.hours, currentDateTime) ? "Open " : "Closed "}
                          </span>

                          {/* Show today’s hours inline */}
                          <span className="ml-2 text-sm text-gray-500">
                            (
                            {(() => {
                              const dayName = new Date().toLocaleDateString("en-US", {
                                weekday: "long",
                              });
                              const todayHours = r.hours.find((entry) => entry[dayName]);
                              if (!todayHours) return "No hours set";

                              const opening = todayHours[dayName].Opening;
                              const closing = todayHours[dayName].Closing;
                              return `${formatTime(opening)} - ${formatTime(closing)}`;
                            })()}
                            )
                          </span>
                        </>
                      )}
                    </p>

                    {/* Only show available menu items */}
                    {isExpanded && r.menu && r.menu.filter(item => item.available).length > 0 && (
                      <ul className="mt-4 space-y-4">
                        {r.menu.filter(item => item.available).map((item, index) => (
                          <li
                            key={index}
                            className="border rounded p-3 shadow-sm flex flex-col sm:flex-row sm:items-start gap-4"
                          >
                            <div className="flex items-start space-x-4">
                              {item.imgUrl && (
                                <img
                                  src={item.imgUrl}
                                  alt={item.name}
                                  style={{ width: "100px", height: "100px", objectFit: "cover" }}
                                  className="rounded shrink-0"
                                />
                              )}
                              <div>
                                <h5 className="font-semibold">{item.name}</h5>
                                <p className="text-sm text-gray-600">{item.description}</p>
                                <p className="text-sm text-gray-500">Calories: {item.calories}</p>
                                <p className="text-sm font-medium">${item.price?.toFixed(2)}</p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {isExpanded && (!r.menu || r.menu.filter(item => item.available).length === 0) && (
                      <p className="mt-2 text-sm italic text-gray-500">No menu available.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}



/*
* replace tailwind with regular css or get tailwind working
* On user restaurant selection -> food item choice selection -> pay + order -> new restaurantOrders map (courier task shows up)

Later: Add a precise location pointer on clicking the map (reason: the geolocator is not that precise)
Later: Special restaurant instructions (allergy)
Later: Special courier instructions (gated entry password...)
Later: Show courier moving on map (car icon)
Later: Do not allow orders on closed stores, do not show closed stores, do not retrieve closed stores
Later: If a courier is not in range of the closing time of a restaurant (show the location, but do not allow orders)
Later: To reduce search results (Fetch restaurants):
    ~ 1. filter all by distance (max distance up to 100km)
    ~ 2. filter by open hours
    ~ 3. no places with the same name after 5 occurances
    ~ 4. gather all result witin 100km from database on a single request, only show results based on map +/- distance to reduce database reads

Maybe: Since anyone can create a restaurant, many can appear on the map. Preferential appearance based on totalOrders from unique userId. Advanced (restaurant): Paid preferential appearance option like Google Search.
Maybe: Status updates from system (admin has contacted courier, admin has changed courier, estimated wait time)
Maybe: System updates from courier (waiting for restaurant, assistance button pressed)

Advanced: decrease database read and writes by setting static restaurant range
Advanced: Message system to admin team if excessive wait time
Advanced: order from multiple restaurants in one order.


# Assumes GPS is generally static, user can modify in input section
# Search radius: start local at 25km (small selection -> limited search results)
                 max distance at 100km (some people might want specialty takeout -> issue with ordering large amount of results)
*/