import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  GeoPoint,
  Timestamp,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Navigate, useNavigate } from "react-router-dom";
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
    const savedZoom = sessionStorage.getItem("userMapZoom");

    // Don't fit bounds if zoom already restored
    if (markers.length < 2 || hasFit || savedZoom) return;

    const bounds = L.latLngBounds(markers);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    setHasFit(true);
  }, [map, markers, hasFit]);

  return null;
}


function ZoomToRadius({ setSearchRadius, setMapInstance }) {
  const map = useMap();

  useEffect(() => {
    setMapInstance(map);

    function handleZoom() {
      const zoom = map.getZoom();
      const radius = zoomLevelToKm(zoom);
      setSearchRadius(radius);
      sessionStorage.setItem("userMapZoom", zoom.toString()); //save zoom level during session
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
    if (!position) return;

    const savedZoom = parseInt(sessionStorage.getItem("userMapZoom"));
    const currentZoom = map.getZoom();

    if (!isNaN(savedZoom)) {
      map.setView(position, savedZoom); // use saved
    } else {
      map.setView(position, currentZoom); // fallback to current
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

  if (
    !Opening || !Closing ||
    Opening.length !== 4 || Closing.length !== 4 ||
    Opening === Closing // 🔒 Same open/close time → closed
  ) {
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

  // Overnight handling
  if (closeTime <= openTime) {
    const closeTimeNextDay = new Date(closeTime);
    closeTimeNextDay.setDate(closeTimeNextDay.getDate() + 1);
    return now >= openTime || now <= closeTimeNextDay;
  }

  // Normal hours
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
  const [userData, setUserData] = useState(null);
  const [fetchingUser, setFetchingUser] = useState(true);
  const [error, setError] = useState(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [expandedRestaurantId, setExpandedRestaurantId] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [searchRadius, setSearchRadius] = useState(12); // default 10 km search radius
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [userLatLng, setUserLatLng] = useState([44.413922, -79.707506]); // Georgian Mall Family Dental as fallback
  const [allRestaurants, setAllRestaurants] = useState([]);
  const [filteredRestaurants, setFilteredRestaurants] = useState([]);
  const [userOrders, setUserOrders] = useState([]);


  const navigate = useNavigate();


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
        const uid = user.uid; // 👈 get the Firebase Auth UID
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userDoc = { id: uid, ...userSnap.data() };
          setUserData(userDoc);

          if (userDoc.deliveryLocation) {
            setUserLatLng([
              userDoc.deliveryLocation.latitude,
              userDoc.deliveryLocation.longitude,
            ]);
          }

          setPhoneInput(userDoc.phone || "");
          setAddressInput(userDoc.address || "");
          setFetchingUser(false);
          return;
        }

        // Create new user doc using UID
        const newUser = {
          email: user.email,
          name: user.displayName,
          createdAt: Timestamp.fromDate(new Date()),
          deliveryLocation: new GeoPoint(44.413922, -79.707506),
          phone: "",
          address: "",
        };

        await setDoc(userRef, newUser); // uses UID as document ID

        setUserData({ id: uid, ...newUser });
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
        const fetched = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setAllRestaurants(fetched); //all restaurants on initial fetch appear on map
        // only those restaurants user toggles with +/- appear on list (filtered by distance)

      } catch (err) {
        console.error("Error fetching restaurants:", err);
      }
    })();
  }, [user]);

  // Inside useEffect or after fetching restaurants:
  useEffect(() => {
    const filtered = allRestaurants
      .map((r) => {
        const rLat = r.location?.latitude;
        const rLng = r.location?.longitude;
        if (!rLat || !rLng) return null;

        const distance = getDistanceInKm(
          userLatLng[0],
          userLatLng[1],
          rLat,
          rLng
        );

        return { ...r, distance: parseFloat(distance) };
      })
      .filter((r) => r && r.distance <= searchRadius);

    setFilteredRestaurants(filtered);
  }, [searchRadius, userLatLng, allRestaurants]);

  //ORDERS FOR USER
  useEffect(() => {
    if (!userData?.id || allRestaurants.length === 0) return;

    const unsubscribers = [];
    let collectedOrders = [];

    for (const restaurant of allRestaurants) {
      const ordersRef = collection(db, "restaurants", restaurant.id, "restaurantOrders");

      const unsubscribe = onSnapshot(ordersRef, (snapshot) => {
        const restaurantOrders = [];

        snapshot.forEach((docSnap) => {
          const orderData = docSnap.data();
          if (orderData.userId === userData.id) {
            restaurantOrders.push({ ...orderData, orderId: docSnap.id });
            console.log("Checking order:", {
              fromRestaurant: restaurant.storeName,
              orderUserId: orderData.userId,
              currentUserId: userData.id,
            });
          }
        });

        // Update collected orders from all restaurants
        collectedOrders = [
          ...collectedOrders.filter(o => o.fromRestaurant !== restaurant.storeName),
          ...restaurantOrders.map(order => ({ ...order, fromRestaurant: restaurant.storeName })),
        ];

        // Set only once all restaurants have been processed at least once
        //setUserOrders([...collectedOrders].sort((a, b) => b.createdAt?.toDate() - a.createdAt?.toDate()));
      //});
        setUserOrders([...collectedOrders]);
      });

      unsubscribers.push(unsubscribe);
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [userData?.id, allRestaurants]);


  // Handle phone and address update form submit
  const phoneRegex = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!userData) return;

    if (!addressInput.trim()) {
      alert("Please enter your address.");
      return;
    }

    if (!phoneRegex.test(phoneInput.trim())) {
      alert("Please enter a valid phone number (e.g. 555-123-4567).");
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
        phone: phoneInput.trim(),
      };

      await updateDoc(userRef, updatedFields);

      setUserData((prev) => ({
        ...prev,
        ...updatedFields,
      }));

      setUserLatLng([lat, lng]);
      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Failed to update profile:", err);
      setError("Failed to update your profile. Please try again.");
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

  const restaurantsWithinRange = filteredRestaurants;
  const shouldFitBounds = restaurantsWithinRange.length > 0;

  const groupedFilteredByType = filteredRestaurants.reduce((acc, r) => {
    const type = r.type || "Other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  const filteredTypes = Object.keys(groupedFilteredByType).sort();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user.displayName} (User)
      </h1>

      <h2 className="text-xl font-bold mt-8 mb-4">Current Orders</h2>
      {userOrders.length === 0 ? (
        <p className="text-gray-600 italic">No current orders found.</p>
      ) : (
        <div className="space-y-4">
          {userOrders.map((order, index) => (
            <div
              key={order.orderId || index}
              className="border rounded p-4 bg-yellow-50 border-yellow-300 text-yellow-800 shadow-sm"
            >
              <h3 className="font-semibold text-lg mb-1">Order #{index + 1}</h3>
              <p><strong>Status:</strong> {order.deliveryStatus}</p>
              <p><strong>Restaurant:</strong> {order.restaurantAddress}</p>
              <p><strong>Estimated Ready Time:</strong>{" "}
                {order.estimatedReadyTime?.toDate().toLocaleString()}
              </p>
              <div className="mt-2">
                <strong>Items:</strong>
                <ul className="list-disc list-inside ml-4">
                  {order.items?.map((item, idx) => (
                    <li key={idx}>
                      {item.name} (x{item.quantity})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <hr className="my-8 border-t-2 border-gray-300" />
      <form onSubmit={handleProfileSubmit}>
        <table className="w-full table-fixed border border-gray-300 mt-4">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-2 border-b w-1/6">Field</th>
              <th className="text-left px-4 py-2 border-b w-1/3">Value</th>
              <th className="text-left px-4 py-2 border-b w-1/6">Actions</th>
            </tr>
          </thead>

          <tbody>
            {/* Non-editable fields */}
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

            {/* Editable Phone input */}
            <tr>
              <td className="px-4 py-2 border-b align-top">Phone</td>
              <td className="px-4 py-2 border-b">
                <input
                  type="tel"
                  className="border px-4 py-2 text-base rounded w-full max-w-[60ch]"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="555-123-4567"
                />
              </td>
            </tr>

            {/* Editable Address input */}
            <tr>
              <td className="px-4 py-2 border-b align-top">Address</td>
              <td className="px-4 py-2 border-b">
                <input
                  type="text"
                  className="border px-4 py-2 text-base rounded w-full max-w-[60ch]"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="123 Main St, City, Country"
                />
              </td>
              {/* The button spans two rows */}
              <td className="px-4 py-2 border-b align-top" rowSpan={1}>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full"
                  disabled={savingProfile}
                >
                  {savingProfile ? "Saving..." : "Update"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      <div className="h-[500px] w-full rounded overflow-hidden border border-gray-300 mt-4">
        <MapContainer
          center={userLatLng}
          zoom={parseInt(sessionStorage.getItem("userMapZoom")) || 11} //Restore session level or fallback to 11
          scrollWheelZoom={false}
          style={{ height: "300px", width: "300px" }}
        >
          <MapSetTo position={userLatLng} />
          <ZoomToRadius
            setSearchRadius={setSearchRadius}
            setMapInstance={setMapInstance}
          />
          {shouldFitBounds && (
            <FitBoundsView
              markers={[
                userLatLng,
                ...restaurantsWithinRange.map((r) => [
                  r.location.latitude,
                  r.location.longitude,
                ]),
              ]}
            />
          )}
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={userLatLng}>
            <Popup>Your delivery location</Popup>
          </Marker>

          {allRestaurants
          .map((r) => {
            const rLat = r.location?.latitude;
            const rLng = r.location?.longitude;
            if (!rLat || !rLng) return null;

            const distance = getDistanceInKm(
              userLatLng[0],
              userLatLng[1],
              rLat,
              rLng
            );

            return { ...r, distance: parseFloat(distance) };
          })
          .filter((r) => r && r.distance <= 100)
          .map((r) => (
            <Marker
              key={r.id}
              position={[r.location.latitude, r.location.longitude]}
              icon={restaurantIcon}
            >
            <Popup>
              {r.storeName}
              <br />
              {r.address}
              <br />
              {r.distance.toFixed(2)} km away
            </Popup>
            </Marker>
          ))}

        </MapContainer>
      </div>
    
      <h2 className="mt-8 text-xl">Nearby Restaurants within {searchRadius} km</h2>
      <div className="mt-4 space-y-6">
        {filteredTypes.map((type) => (
        <div key={type}>
          <h3 className="text-lg font-semibold mb-2">{type}</h3>
          <ul className="space-y-2">
            {groupedFilteredByType[type].map((r) => {
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
                  onClick={() => {
                    const encodedName = encodeURIComponent(r.storeName);
                    const encodedId = encodeURIComponent(r.restaurantId);
                    navigate(`/user/${encodedName}/${encodedId}/order`, { state: { restaurant: r } });
                  }}
                >
                    <h4 className="font-semibold">
                      {r.storeName} — Rating: {r.rating}
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
*** 2. Under current orders: Confirm deliveryStatus string showing restaurant rejects the order
*** 6. if courier accepts offer; car icon appears on user's map according to courier gps


* Later: Better UI -> top right nav is UserPage user profile link (Name, email, phone* Please complete your user profile before ordering message; delete account)
* Later: replace tailwind with regular css or get tailwind working
* Later: Add a precise location pointer on clicking the map (reason: the geolocator is not that precise) or just use location services
* Later: Special restaurant instructions (allergy)
* Later: Special courier instructions (gated entry password...)
* Later: Show courier moving on map (car icon)
* Later: Do not allow orders on closed stores, do not show closed stores, do not retrieve closed stores
* Later: If a courier is not in range of the closing time of a restaurant (show the location, but do not allow orders)
* Later: To reduce LIST search results (Fetch restaurants):
    ~ 1. filter all by distance (max distance up to 100km) -> Done with toggling +/- ✅
    ~ 2. filter by open hours -> possibly keep, but closed are ordered to lowest on list
    ~ 3. no places with the same name after 5 occurances
* Maybe: Since anyone can create a restaurant, many can appear on the map. Preferential appearance based on totalOrders from unique userId. Advanced (restaurant): Paid preferential appearance option like Google Search.
* Maybe: Status updates from system (admin has contacted courier, admin has changed courier, estimated wait time)
* Maybe: System updates from courier (waiting for restaurant, assistance button pressed)
* Advanced: Message system to admin team if excessive wait time
* Advanced: order from multiple restaurants in one order.


# Assumes GPS is generally static, user can modify in input section
# Search radius: start local at 25km (small selection -> limited search results)
                 max distance at 100km (some people might want specialty takeout -> issue with ordering large amount of results)
*/