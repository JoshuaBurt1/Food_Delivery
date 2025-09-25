import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  getDoc,
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
      throw new Error("No results found");
    }
  } catch (err) {
    console.error("Geocoding failed:", err);
    throw err;
  }
}

function parseHoursArray(hoursArray) {
  const result = {};
  hoursArray.forEach((dayObj) => {
    const [day, times] = Object.entries(dayObj)[0];
    result[day] = times;
  });
  return result;
}

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

  // For orders
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  // Once restaurantData is loaded, parse hours
  useEffect(() => {
    if (restaurantData?.hours) {
      const parsed = parseHoursArray(restaurantData.hours);
      setHoursState(parsed);
    }
  }, [restaurantData]);

  // Fetch or create restaurant based on logged-in user
  useEffect(() => {
    if (!user) return;

    const restaurantsRef = collection(db, "restaurants");

    const fetchOrCreate = async () => {
      try {
        const snapshot = await getDocs(restaurantsRef);
        const matchedDoc = snapshot.docs.find((docSnap) => {
          const data = docSnap.data();
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

        // No existing, create new restaurant
        const newRest = {
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
          location: new GeoPoint(0, 0),
          name: user.displayName,
          phone: "",
          rating: 0,
          storeName: "",
          totalOrders: 0,
          type: "",
        };

        const docRef = await addDoc(restaurantsRef, newRest);
        await updateDoc(docRef, { restaurantId: docRef.id });

        setRestaurantData({ id: docRef.id, restaurantId: docRef.id, ...newRest });
        setFetchingRestaurant(false);
      } catch (err) {
        console.error("Error in fetchOrCreate restaurant:", err);
        setError("Error setting up your restaurant info.");
        setFetchingRestaurant(false);
      }
    };

    fetchOrCreate();
  }, [user]);

  // Fetch orders belonging to this restaurant
  useEffect(() => {
    if (!restaurantData?.id) return;

    const fetchOrders = async () => {
      try {
        const ordersRef = collection(db, "restaurants", restaurantData.id, "restaurantOrders");
        const ordersSnap = await getDocs(ordersRef);
        const fetchedOrders = [];

        ordersSnap.forEach((docSnap) => {
          const orderData = docSnap.data();
          fetchedOrders.push({
            ...orderData,
            orderId: docSnap.id, // add document ID
          });
        });

        setOrders(fetchedOrders);
      } catch (err) {
        console.error("Error fetching restaurant orders from subcollection:", err);
        setError("Failed to load orders.");
      } finally {
        setLoadingOrders(false);
      }
    };

    fetchOrders();
  }, [restaurantData]);

  // Confirm / Reject handlers
  const handleConfirmOrder = async (orderId) => {
    try {
      const orderDocRef = doc(
        db,
        "restaurants",
        restaurantData.id,
        "restaurantOrders",
        orderId
      );

      await updateDoc(orderDocRef, {
        orderConfirmed: true,
        deliveryStatus: "Confirmed, order being prepared.",
      });

      // Update local state
      setOrders((prev) =>
        prev.map((o) =>
          o.orderId === orderId
            ? {
                ...o,
                orderConfirmed: true,
                deliveryStatus: "Confirmed, order being prepared.",
              }
            : o
        )
      );
    } catch (err) {
      console.error("Error confirming order:", err);
      setError("Failed to confirm order.");
    }
  };

  const handleRejectOrder = async (orderId) => {
    try {
      const orderDocRef = doc(
        db,
        "restaurants",
        restaurantData.id,
        "restaurantOrders",
        orderId
      );
      await updateDoc(orderDocRef, {
        orderConfirmed: false,
        deliveryStatus: "Rejected by restaurant.",
      });
      
      // Update local state
      setOrders((prev) =>
        prev.map((o) =>
          o.orderId === orderId
            ? {
                ...o,
                orderConfirmed: false,
                deliveryStatus: "Rejected by restaurant.",
              }
            : o
        )
      );
    } catch (err) {
      console.error("Error rejecting order:", err);
      setError("Failed to reject order.");
    }
  };

  // Rendering
  if (loadingAuth || fetchingRestaurant) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (error)
    return (
      <div className="p-6 text-red-600 font-semibold">
        Error: {error}
      </div>
    );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user.displayName || user.email} (Restaurant Manager)
      </h1>

      {/* Restaurant Info Section */}
      <div className="mt-6 bg-gray-100 p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Restaurant Info</h2>
        <p>
          <strong>Restaurant ID:</strong> {restaurantData.restaurantId}
        </p>
        <p>
          <strong>Created At:</strong>{" "}
          {restaurantData.createdAt?.toDate
            ? restaurantData.createdAt.toDate().toLocaleString()
            : new Date(restaurantData.createdAt).toLocaleString()}
        </p>
        <p>
          <strong>Email:</strong> {restaurantData.email}
        </p>
        <p>
          <strong>Name:</strong> {restaurantData.name}
        </p>
        <p>
          <strong>Address / Location:</strong> {restaurantData.address} / Lat:{" "}
          {restaurantData.location?.latitude}, Lng:{" "}
          {restaurantData.location?.longitude}
        </p>
        <p>
          <strong>Rating:</strong> {restaurantData.rating}
        </p>
        <p>
          <strong>Total Orders:</strong> {restaurantData.totalOrders}
        </p>
      </div>

      {/* Form to edit restaurant info */}
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
            alert("Please enter a valid phone number (e.g. 123‑456‑7890)");
            return;
          }

          try {
            const { lat, lng } = await geocodeAddress(address);
            const location = new GeoPoint(lat, lng);
            const formattedHours = formatHoursForFirestore(hoursState);

            const updated = {
              storeName,
              address,
              phone,
              type,
              location,
              hours: formattedHours,
            };

            const docRef = doc(db, "restaurants", restaurantData.id);
            await updateDoc(docRef, updated);

            setRestaurantData((prev) => ({ ...prev, ...updated }));
            alert("Restaurant info updated");
          } catch (err) {
            console.error("Update restaurant error:", err);
            alert("Failed to update restaurant info");
          }
        }}
      >
        <h2 className="text-lg font-semibold">Edit Restaurant Info</h2>
        <div>
          <label>Store Name</label>
          <input
            name="storeName"
            defaultValue={restaurantData.storeName || ""}
            required
            className="w-full border px-2 py-1 rounded"
          />
        </div>
        <div>
          <label>Address</label>
          <input
            name="address"
            defaultValue={restaurantData.address || ""}
            required
            className="w-full border px-2 py-1 rounded"
          />
        </div>
        <div>
          <label>Phone</label>
          <input
            name="phone"
            defaultValue={restaurantData.phone || ""}
            required
            className="w-full border px-2 py-1 rounded"
          />
        </div>
        <div>
          <label>Type</label>
          <input
            name="type"
            defaultValue={restaurantData.type || ""}
            className="w-full border px-2 py-1 rounded"
          />
        </div>
        <div className="mt-4">
          <h3 className="font-semibold">Working Hours</h3>
          {Object.entries(hoursState).map(([day, { Opening, Closing }]) => (
            <div key={day} className="flex items-center gap-4 mb-2">
              <span className="w-20 font-medium">{day}</span>
              <input
                type="text"
                value={Opening}
                onChange={(e) =>
                  setHoursState((prev) => ({
                    ...prev,
                    [day]: { ...prev[day], Opening: e.target.value },
                  }))
                }
                placeholder="0900"
                className="border px-2 py-1 w-24 rounded"
              />
              <input
                type="text"
                value={Closing}
                onChange={(e) =>
                  setHoursState((prev) => ({
                    ...prev,
                    [day]: { ...prev[day], Closing: e.target.value },
                  }))
                }
                placeholder="1700"
                className="border px-2 py-1 w-24 rounded"
              />
            </div>
          ))}
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Save Info
        </button>
      </form>

      {/* Add new menu item */}
      <form
        className="mt-6 space-y-4 bg-gray-50 p-4 rounded shadow"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newMenuItem.name || !newMenuItem.price) {
            alert("Name & price required");
            return;
          }
          const item = {
            ...newMenuItem,
            calories: parseInt(newMenuItem.calories),
            price: parseFloat(newMenuItem.price),
            prepTime: parseInt(newMenuItem.prepTime),
          };

          const updatedMenu = [...(restaurantData.menu || []), item];

          const docRef = doc(db, "restaurants", restaurantData.id);
          try {
            await updateDoc(docRef, { menu: updatedMenu });
            setRestaurantData((prev) => ({
              ...prev,
              menu: updatedMenu,
            }));
            setNewMenuItem({
              name: "",
              description: "",
              calories: "",
              price: "",
              prepTime: "",
              imgUrl: "",
              available: true,
            });
            alert("Menu item added");
          } catch (err) {
            console.error("Add menu item error:", err);
            alert("Failed to add menu item");
          }
        }}
      >
        <h2 className="text-lg font-semibold">Add Menu Item</h2>
        <input
          type="text"
          placeholder="Name"
          value={newMenuItem.name}
          onChange={(e) =>
            setNewMenuItem((prev) => ({ ...prev, name: e.target.value }))
          }
          className="w-full border px-2 py-1 rounded"
          required
        />
        <input
          type="text"
          placeholder="Description"
          value={newMenuItem.description}
          onChange={(e) =>
            setNewMenuItem((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
          className="w-full border px-2 py-1 rounded"
        />
        <input
          type="number"
          placeholder="Calories"
          value={newMenuItem.calories}
          onChange={(e) =>
            setNewMenuItem((prev) => ({
              ...prev,
              calories: e.target.value,
            }))
          }
          className="w-full border px-2 py-1 rounded"
        />
        <input
          type="number"
          placeholder="Price"
          step="0.01"
          value={newMenuItem.price}
          onChange={(e) =>
            setNewMenuItem((prev) => ({
              ...prev,
              price: e.target.value,
            }))
          }
          className="w-full border px-2 py-1 rounded"
          required
        />
        <input
          type="number"
          placeholder="Prep Time (min)"
          value={newMenuItem.prepTime}
          onChange={(e) =>
            setNewMenuItem((prev) => ({
              ...prev,
              prepTime: e.target.value,
            }))
          }
          className="w-full border px-2 py-1 rounded"
        />
        <input
          type="text"
          placeholder="Image URL"
          value={newMenuItem.imgUrl}
          onChange={(e) =>
            setNewMenuItem((prev) => ({ ...prev, imgUrl: e.target.value }))
          }
          className="w-full border px-2 py-1 rounded"
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={newMenuItem.available}
            onChange={(e) =>
              setNewMenuItem((prev) => ({
                ...prev,
                available: e.target.checked,
              }))
            }
          />
          Available
        </label>
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Add Item
        </button>
      </form>

      {/* Current Menu Display */}
      {restaurantData.menu && restaurantData.menu.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-4">Current Menu Items</h2>
          <ul className="space-y-4">
            {restaurantData.menu.map((item, idx) => (
              <li
                key={idx}
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
                      onChange={(e) =>
                        setRestaurantData((prev) => {
                          const newMenu = [...prev.menu];
                          newMenu[idx] = { ...newMenu[idx], name: e.target.value };
                          return { ...prev, menu: newMenu };
                        })
                      }
                      className="font-semibold w-full border px-2 py-1 rounded"
                    />
                    <textarea
                      value={item.description}
                      onChange={(e) =>
                        setRestaurantData((prev) => {
                          const newMenu = [...prev.menu];
                          newMenu[idx] = { ...newMenu[idx], description: e.target.value };
                          return { ...prev, menu: newMenu };
                        })
                      }
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="number"
                      value={item.calories}
                      onChange={(e) =>
                        setRestaurantData((prev) => {
                          const newMenu = [...prev.menu];
                          newMenu[idx] = { ...newMenu[idx], calories: e.target.value };
                          return { ...prev, menu: newMenu };
                        })
                      }
                      placeholder="Calories"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={item.price}
                      onChange={(e) =>
                        setRestaurantData((prev) => {
                          const newMenu = [...prev.menu];
                          newMenu[idx] = { ...newMenu[idx], price: e.target.value };
                          return { ...prev, menu: newMenu };
                        })
                      }
                      placeholder="Price"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="number"
                      value={item.prepTime}
                      onChange={(e) =>
                        setRestaurantData((prev) => {
                          const newMenu = [...prev.menu];
                          newMenu[idx] = { ...newMenu[idx], prepTime: e.target.value };
                          return { ...prev, menu: newMenu };
                        })
                      }
                      placeholder="Prep Time"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />
                    <input
                      type="text"
                      value={item.imgUrl}
                      onChange={(e) =>
                        setRestaurantData((prev) => {
                          const newMenu = [...prev.menu];
                          newMenu[idx] = { ...newMenu[idx], imgUrl: e.target.value };
                          return { ...prev, menu: newMenu };
                        })
                      }
                      placeholder="Image URL"
                      className="text-sm w-full border px-2 py-1 rounded"
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.available}
                        onChange={(e) =>
                          setRestaurantData((prev) => {
                            const newMenu = [...prev.menu];
                            newMenu[idx] = {
                              ...newMenu[idx],
                              available: e.target.checked,
                            };
                            return { ...prev, menu: newMenu };
                          })
                        }
                      />
                      Available
                    </label>

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          const updatedMenu = restaurantData.menu.map((mi, i) =>
                            i === idx
                              ? {
                                  ...mi,
                                  calories: parseInt(mi.calories),
                                  price: parseFloat(mi.price),
                                  prepTime: parseInt(mi.prepTime),
                                }
                              : mi
                          );
                          const docRef = doc(db, "restaurants", restaurantData.id);
                          updateDoc(docRef, { menu: updatedMenu })
                            .then(() => {
                              alert("Menu updated");
                              setRestaurantData((prev) => ({
                                ...prev,
                                menu: updatedMenu,
                              }));
                            })
                            .catch((err) => {
                              console.error("Update menu error:", err);
                              alert("Failed updating menu");
                            });
                        }}
                        className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                      >
                        Update
                      </button>
                      <button
                        onClick={() => {
                          const updatedMenu = restaurantData.menu.filter(
                            (_, i) => i !== idx
                          );
                          const docRef = doc(db, "restaurants", restaurantData.id);
                          updateDoc(docRef, { menu: updatedMenu })
                            .then(() => {
                              alert("Deleted menu item");
                              setRestaurantData((prev) => ({
                                ...prev,
                                menu: updatedMenu,
                              }));
                            })
                            .catch((err) => {
                              console.error("Delete menu error:", err);
                              alert("Failed deleting menu item");
                            });
                        }}
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

      {/* Current Orders Section */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold mb-4">Current Orders</h2>
        {loadingOrders ? (
          <p>Loading orders…</p>
        ) : orders.length === 0 ? (
          <p>No current orders.</p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.orderId}
                className="border rounded p-4 bg-white shadow-sm"
              >
                <p>
                  <strong>Order ID:</strong> {order.orderId}
                </p>
                <p>
                  <strong>Status:</strong> {order.deliveryStatus}
                </p>
                <p>
                  <strong>Estimated Ready:</strong>{" "}
                  {order.estimatedReadyTime?.toDate().toLocaleString()}
                </p>
                <p>
                  <strong>Items:</strong>
                </p>
                <ul className="ml-4 list-disc">
                  {order.items?.map((item, i) => (
                    <li key={i}>
                      {item.name} × {item.quantity} (prep: {item.prepTime} min)
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex space-x-2">
                  <button
                    onClick={() => handleConfirmOrder(order.orderId)}
                    disabled={order.orderConfirmed === true}
                    className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => handleRejectOrder(order.orderId)}
                    disabled={order.orderConfirmed === false}
                    className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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

