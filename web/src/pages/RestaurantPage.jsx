import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  addDoc,
  GeoPoint,
  Timestamp,
  doc,
  updateDoc,
} from "firebase/firestore";

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

// OPENING/CLOSING hours Functions
function parseHoursArray(hoursArray) {
  const result = {};
  hoursArray.forEach((dayObj) => {
    const [day, times] = Object.entries(dayObj)[0];
    result[day] = times;
  });
  return result;
}

function formatHoursForFirestore(hoursObject) {
  return Object.entries(hoursObject).map(([day, times]) => ({
    [day]: times,
  }));
}

export default function RestaurantPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [restaurantData, setRestaurantData] = useState(null);
  const [fetchingRestaurant, setFetchingRestaurant] = useState(true);
  const [error, setError] = useState("");
  const [hoursState, setHoursState] = useState({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (restaurantData?.hours) {
      const parsed = parseHoursArray(restaurantData.hours);
      setHoursState(parsed);
    }
  }, [restaurantData]);

  useEffect(() => {
    if (!user) return;

    const restaurantsRef = collection(db, "restaurants");

    const fetchOrCreateRestaurant = async () => {
      try {
        const snapshot = await getDocs(restaurantsRef);

        const matchedDoc = snapshot.docs.find((doc) => {
          const data = doc.data();
          const emailMatch = data.email === user.email;
          const nameMatch =
            data.name?.toLowerCase().trim() ===
            user.displayName?.toLowerCase().trim();
          return emailMatch || nameMatch;
        });

        if (matchedDoc) {
          setRestaurantData({ id: matchedDoc.id, ...matchedDoc.data() });
          setFetchingRestaurant(false);
          return;
        }

        // No match found: create a new restaurant document
        const newRestaurant = {
          address: "",
          createdAt: Timestamp.fromDate(new Date()),
          email: user.email,
          hours: [
            { Monday: { Opening: "0900", Closing: "1700" } },
            { Tuesday: { Opening: "0900", Closing: "1700" } },
            { Wednesday: { Opening: "0900", Closing: "1700" } },
            { Thursday: { Opening: "0900", Closing: "1700" } },
            { Friday: { Opening: "0900", Closing: "1700" } },
            { Saturday: { Opening: "0900", Closing: "1700" } },
            { Sunday: { Opening: "0900", Closing: "1700" } },
          ],
          location: new GeoPoint(90, 0),
          name: user.displayName,
          phone: "",
          rating: 10,
          storeName: "",
          totalOrders: 0,
          type: ""
        };

        const docRef = await addDoc(restaurantsRef, newRestaurant);
        await updateDoc(docRef, { restaurantId: docRef.id });

        setRestaurantData({ id: docRef.id, restaurantId: docRef.id, ...newRestaurant });
        setFetchingRestaurant(false);
      } catch (err) {
        console.error("Error fetching or creating restaurant:", err);
        setError("Something went wrong while setting up your restaurant.");
        setFetchingRestaurant(false);
      }
    };

    fetchOrCreateRestaurant();
  }, [user]);

  if (loadingAuth || fetchingRestaurant) return <div>Loading...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user.displayName} (Restaurant Manager)
      </h1>

      {/* Uneditable Info Section */}
      <div className="mt-6 bg-gray-100 p-4 rounded-md shadow">
        <h2 className="text-lg font-semibold mb-2">Restaurant Details</h2>
        <p><strong>Restaurant ID:</strong> {restaurantData.restaurantId}</p>
        <p><strong>Created At:</strong> {
            restaurantData.createdAt?.toDate
              ? restaurantData.createdAt.toDate().toLocaleString()
              : new Date(restaurantData.createdAt).toLocaleString()
          }
        </p>
        <p><strong>Email:</strong> {restaurantData.email}</p>
        <p><strong>Manager Name:</strong> {restaurantData.name}</p>
        <p><strong>Location:</strong> Lat: {restaurantData.location?.latitude}, Lng: {restaurantData.location?.longitude}</p>
        <p><strong>Rating:</strong> {restaurantData.rating}</p>
        <p><strong>Total Orders:</strong> {restaurantData.totalOrders}</p>
      </div>

      {/* Editable Form */}
      <form
        className="mt-6 space-y-4 max-w-md"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target;
          const storeName = form.storeName.value.trim();
          const address = form.address.value.trim();
          const type = form.type.value.trim();

          try {
            // Geocode the address
            const { lat, lng } = await geocodeAddress(address);
            const location = new GeoPoint(lat, lng);
            const formattedHours = formatHoursForFirestore(hoursState);

            // Prepare data to update
            const updatedData = {
              storeName,
              address,
              type,
              location,
              hours: formattedHours,
            };

            // Save to Firestore
            const docRef = doc(db, "restaurants", restaurantData.id);
            await updateDoc(docRef, updatedData);

            // Update local state
            setRestaurantData((prev) => ({ ...prev, ...updatedData }));
            alert("Restaurant info updated successfully.");
          } catch (err) {
            console.error("Error updating restaurant info:", err);
            alert("Failed to update restaurant info or geolocation.");
          }
        }}
      >
        <h2 className="text-lg font-semibold mb-2">Update Restaurant Info</h2>

        <div>
          <label className="block text-sm font-medium">Store Name</label>
          <input
            name="storeName"
            defaultValue={restaurantData.storeName || ""}
            required
            className="mt-1 w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Address</label>
          <input
            name="address"
            defaultValue={restaurantData.address || ""}
            required
            className="mt-1 w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Restaurant Type</label>
          <input
            name="type"
            defaultValue={restaurantData.type || ""}
            required
            className="mt-1 w-full border px-3 py-2 rounded"
          />
        </div>
        {/* Hours Form Section */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Weekly Hours</h2>

          {Object.entries(hoursState).map(([day, { Opening, Closing }]) => (
            <div key={day} className="flex items-center gap-4 mb-2">
              <span className="w-20 font-medium">{day}</span>
              <input
                type="text"
                name={`${day}-opening`}
                value={Opening}
                onChange={(e) =>
                  setHoursState((prev) => ({
                    ...prev,
                    [day]: { ...prev[day], Opening: e.target.value },
                  }))
                }
                placeholder="Opening (e.g. 0900)"
                className="border px-2 py-1 rounded w-32"
              />
              <input
                type="text"
                name={`${day}-closing`}
                value={Closing}
                onChange={(e) =>
                  setHoursState((prev) => ({
                    ...prev,
                    [day]: { ...prev[day], Closing: e.target.value },
                  }))
                }
                placeholder="Closing (e.g. 1700)"
                className="border px-2 py-1 rounded w-32"
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Save Changes
        </button>
      </form>
    </div>
  );
}


/*

*** add phone number and menu to form
Later: Add a precise location pointer on clicking the map (reason: the geolocator is not that precise)
Later: Can view collection systemFiles, restaurantOrders for their restaurantId only (to make food)
Later: Can view collection systemFiles, enrouteOrders for their restaurantId only (to confirm courierId on pick-up)

Maybe: field to upload map logo

Advanced: Restaurant has to accept the order for it to be processed -> refund user if not accepted
Advanced: the reason orders are in systemFiles and not restaurant:
1. the number of restaurantOrders, enrouteOrders, completedOrders could get very large -> large document
2. restaurantOrders & enrouteOrders array are constantly added to / deleted keeping it a managable size
3. completedOrders is the only "infinite" size document, rarely accessed. Can be ordered and searched quickly by createdAt date, courierId, restaurantId, userId.
# these could be broken up further to reduce size (one restaurantOrders/enrouteOrders/completedOrders per restuarant); collection within a document


# validity of address is "enforced" by the restaurant manager wanting sales. Advanced: further enforced by a courier message to admin if unable to access site.
# reused components:
UserPage & RestaurantPage // ADDRESS to GEOLOCATION: OpenCage API -> async function geocodeAddress(address) { ...
*/

