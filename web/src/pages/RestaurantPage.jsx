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

// PHONE
const phoneRegex = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;

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
  const [newMenuItem, setNewMenuItem] = useState({
    name: "",
    description: "",
    calories: "",
    price: "",
    prepTime: "",
    imgUrl: "",
    available: true,
  });

  // MENU
  function handleMenuChange(index, field, value) {
    const updatedMenu = [...restaurantData.menu];
    updatedMenu[index] = { ...updatedMenu[index], [field]: value };

    setRestaurantData((prev) => ({
      ...prev,
      menu: updatedMenu,
    }));
  }

  function updateMenuItem(index) {
    const updatedMenu = restaurantData.menu.map((item, i) =>
      i === index
        ? {
            ...item,
            calories: parseInt(item.calories),
            price: parseFloat(item.price),
            prepTime: parseInt(item.prepTime),
          }
        : item
    );

    const docRef = doc(db, "restaurants", restaurantData.id);
    updateDoc(docRef, { menu: updatedMenu })
      .then(() => {
        alert("Menu item updated.");
        setRestaurantData((prev) => ({
          ...prev,
          menu: updatedMenu,
        }));
      })
      .catch((err) => {
        console.error("Update failed:", err);
        alert("Failed to update menu item.");
      });
  }

  function deleteMenuItem(index) {
    const updatedMenu = restaurantData.menu.filter((_, i) => i !== index);

    const docRef = doc(db, "restaurants", restaurantData.id);
    updateDoc(docRef, { menu: updatedMenu })
      .then(() => {
        alert("Menu item deleted.");
        setRestaurantData((prev) => ({
          ...prev,
          menu: updatedMenu,
        }));
      })
      .catch((err) => {
        console.error("Delete failed:", err);
        alert("Failed to delete menu item.");
      });
  }

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
          const phone = form.phone.value.trim();
          const type = form.type.value.trim();

          if (!phoneRegex.test(phone)) {
            alert("Please enter a valid phone number format (e.g. 123-456-7890)");
            return;
          }

          try {
            // Geocode the address
            const { lat, lng } = await geocodeAddress(address);
            const location = new GeoPoint(lat, lng);
            const formattedHours = formatHoursForFirestore(hoursState);

            // Prepare data to update
            const updatedData = {
              storeName,
              address,
              phone,
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
          <label className="block text-sm font-medium">Phone #</label>
          <input
            name="phone"
            defaultValue={restaurantData.phone || ""}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();

          if (!newMenuItem.name || !newMenuItem.price) {
            alert("Name and price are required.");
            return;
          }

          const itemToAdd = {
            ...newMenuItem,
            calories: parseInt(newMenuItem.calories),
            price: parseFloat(newMenuItem.price),
            prepTime: parseInt(newMenuItem.prepTime),
          };

          const updatedMenu = [...(restaurantData.menu || []), itemToAdd];

          const docRef = doc(db, "restaurants", restaurantData.id);
          updateDoc(docRef, { menu: updatedMenu })
            .then(() => {
              alert("Menu item added successfully.");
              setNewMenuItem({
                name: "",
                description: "",
                calories: "",
                price: "",
                prepTime: "",
                imgUrl: "",
                available: true,
              });
              setRestaurantData((prev) => ({
                ...prev,
                menu: updatedMenu,
              }));
            })
            .catch((err) => {
              console.error("Failed to add menu item:", err);
              alert("Error adding menu item.");
            });
        }}
        className="mt-6 space-y-4 bg-gray-50 p-4 rounded shadow"
      >
        {/* Add New Menu Item */}
        <h2 className="text-lg font-semibold">Add New Menu Item</h2>
        <input
          type="text"
          placeholder="Name"
          value={newMenuItem.name}
          onChange={(e) => setNewMenuItem({ ...newMenuItem, name: e.target.value })}
          className="w-full border px-3 py-2 rounded"
          required
        />

        <input
          type="text"
          placeholder="Description"
          value={newMenuItem.description}
          onChange={(e) => setNewMenuItem({ ...newMenuItem, description: e.target.value })}
          className="w-full border px-3 py-2 rounded"
        />

        <input
          type="number"
          placeholder="Calories"
          value={newMenuItem.calories}
          onChange={(e) => setNewMenuItem({ ...newMenuItem, calories: e.target.value })}
          className="w-full border px-3 py-2 rounded"
        />

        <input
          type="number"
          placeholder="Price"
          step="0.01"
          value={newMenuItem.price}
          onChange={(e) => setNewMenuItem({ ...newMenuItem, price: e.target.value })}
          className="w-full border px-3 py-2 rounded"
          required
        />

        <input
          type="number"
          placeholder="Prep Time (minutes)"
          value={newMenuItem.prepTime}
          onChange={(e) =>
            setNewMenuItem({ ...newMenuItem, prepTime: e.target.value })
          }
          className="w-full border px-3 py-2 rounded"
        />

        <input
          type="text"
          placeholder="Image URL"
          value={newMenuItem.imgUrl}
          onChange={(e) => setNewMenuItem({ ...newMenuItem, imgUrl: e.target.value })}
          className="w-full border px-3 py-2 rounded"
        />

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={newMenuItem.available}
            onChange={(e) => setNewMenuItem({ ...newMenuItem, available: e.target.checked })}
          />
          Available
        </label>

        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Add Menu Item
        </button>
      </form>

      {/* Current Menu */}
      {restaurantData.menu && restaurantData.menu.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-4">Current Menu Items</h2>

          <ul className="space-y-4">
            {restaurantData.menu.map((item, index) => (
              <li
                key={index}
                className="border rounded p-4 flex flex-col sm:flex-row sm:items-start gap-4 bg-white shadow-sm"
              >
                <div className="flex items-start space-x-4 w-full">
                  {item.imgUrl && (
                    <img
                      src={item.imgUrl}
                      alt={item.name}
                      style={{ width: "100px", height: "100px", objectFit: "cover" }}
                      className="rounded"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleMenuChange(index, "name", e.target.value)}
                      className="font-semibold w-full border px-2 py-1 rounded"
                    />
                    <textarea
                      value={item.description}
                      onChange={(e) => handleMenuChange(index, "description", e.target.value)}
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="number"
                      value={item.calories}
                      onChange={(e) => handleMenuChange(index, "calories", e.target.value)}
                      placeholder="Calories"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => handleMenuChange(index, "price", e.target.value)}
                      placeholder="Price"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="number"
                      value={item.prepTime}
                      onChange={(e) => handleMenuChange(index, "prepTime", e.target.value)}
                      placeholder="Prep Time (minutes)"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="text"
                      value={item.imgUrl}
                      onChange={(e) => handleMenuChange(index, "imgUrl", e.target.value)}
                      placeholder="Image URL"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.available}
                        onChange={(e) => handleMenuChange(index, "available", e.target.checked)}
                      />
                      Available
                    </label>

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => updateMenuItem(index)}
                        className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                      >
                        Update
                      </button>
                      <button
                        onClick={() => deleteMenuItem(index)}
                        className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


/*
*** 1. Restaurant must show orders (have a confirm & reject button) -> orderConfirmed: null; Status: awaiting restaurant confirmation
       * confirm -> orderConfirmed = True -> deliveryStatus: "order confirmed, being prepared"
       * reject -> orderConfirmed = False -> deliveryStatus: "order rejected" (this could then go to another restaurant...)
       * timeout -> deliveryStatus: "order rejected" (this could then go to another restaurant...)
*** The accepted orders go under heading "Orders awaiting pickup" 
       * button "Pick-up completed" pressed -> deliveryStatus: "order being delivered" (hypothetical: on courier arrival, courierId match)
                                            

* Later: Delete profile field (top right nav user UI)
* Later: Add a precise location pointer on clicking the map (reason: the geolocator is not that precise)
* Maybe: field to upload logo that appears on map
* Advanced: If restaurant does not accept the order -> refund user if not accepted


# Design reasons 
A. The reason orders are in systemFiles and not restaurant:
1. the number of restaurantOrders & completedOrders could get very large -> large document
2. restaurantOrders array are constantly added to / deleted keeping it a managable size
3. completedOrders is the only "infinite" size document, rarely accessed. Can be ordered and searched quickly by createdAt date, courierId, restaurantId, userId.
* these could be broken up further to reduce size (by date or restaurantId or restaurantId & date)
B. validity of address is "enforced" by the restaurant manager wanting sales. Advanced: further enforced by a courier message to admin if unable to access site.


# Reused components:
UserPage & RestaurantPage // ADDRESS to GEOLOCATION: OpenCage API -> async function geocodeAddress(address) { ...

*/

