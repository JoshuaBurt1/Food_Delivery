import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  GeoPoint,
  updateDoc,
  doc,
} from "firebase/firestore";

export default function CourierPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [courierData, setCourierData] = useState(null);
  const [fetchingCourier, setFetchingCourier] = useState(true);
  const [error, setError] = useState("");
  const [locationAccessDenied, setLocationAccessDenied] = useState(false);
  const [orders, setOrders] = useState([]);
  const [fetchingOrders, setFetchingOrders] = useState(true);
  const locationQueue = useRef(null);
  const throttleTimeout = useRef(null);
  const courierDataRef = useRef(courierData);

  useEffect(() => {
    courierDataRef.current = courierData;
  }, [courierData]);

  // Helper: Update courier status in Firestore and state
  const updateCourierStatus = async (status) => {
    if (!courierData?.id) return;
    const courierDocRef = doc(db, "couriers", courierData.id);
    try {
      await updateDoc(courierDocRef, { status });
      setCourierData((prev) => ({ ...prev, status }));
    } catch (err) {
      console.error("Failed to update status:", err);
      setError("Failed to update status.");
    }
  };

  // Helper: Returns a user-friendly location error message based on code
  const getLocationErrorMessage = (code) => {
    switch (code) {
      case 1:
        return "Location access was denied. Please enable location services to continue.";
      case 2:
        return "Location information is unavailable. Check your device settings.";
      case 3:
        return "Location request timed out. Try again with a stronger signal.";
      default:
        return "Unable to access location.";
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const couriersRef = collection(db, "couriers");

    const fetchOrCreateCourier = async () => {
      try {
        const snapshot = await getDocs(couriersRef);

        const matchedDoc = snapshot.docs.find((doc) => {
          const data = doc.data();
          const emailMatch = data.email === user.email;
          const nameMatch =
            data.name?.toLowerCase().trim() ===
            user.displayName?.toLowerCase().trim();
          return emailMatch || nameMatch;
        });

        if (matchedDoc) {
          setCourierData({ id: matchedDoc.id, ...matchedDoc.data() });
          setFetchingCourier(false);
          return;
        }

        if (!navigator.geolocation) {
          setError(
            "Location services are unavailable on your device. Please enable location access to resume courier capabilities."
          );
          setFetchingCourier(false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;

            const newCourier = {
              email: user.email,
              name: user.displayName,
              earnings: 0,
              location: new GeoPoint(latitude, longitude),
              movementFlag: "inactive",
              status: "inactive",
            };

            const docRef = await addDoc(couriersRef, newCourier);
            await updateDoc(docRef, { courierId: docRef.id });

            setCourierData({ id: docRef.id, courierId: docRef.id, ...newCourier });
            setFetchingCourier(false);
          },
          (err) => {
            console.error("Location error", err);
            const message = getLocationErrorMessage(err.code);
            setError(message);

            if (err.code === 1) {
              setLocationAccessDenied(true);
            }

            if (courierData?.id && courierData.status !== "inactive") {
              updateCourierStatus("inactive");
            }

            setFetchingCourier(false);
          }
        );
      } catch (err) {
        console.error("Error fetching or creating courier:", err);
        setError("Something went wrong.");
        setFetchingCourier(false);
      }
    };

    fetchOrCreateCourier();
  }, [user]);

  // Throttled location tracking
  useEffect(() => {
    if (!courierData?.id) return;

    const courierDocRef = doc(db, "couriers", courierData.id);

    const updateLocationInFirestore = async (latitude, longitude) => {
      try {
        await updateDoc(courierDocRef, {
          location: new GeoPoint(latitude, longitude),
        });
      } catch (err) {
        console.error("Failed to update location:", err);
      }
    };

    const updateCourierStatus = async (status) => {
      try {
        await updateDoc(courierDocRef, { status });
        setCourierData((prev) => ({ ...prev, status }));
      } catch (err) {
        console.error("Failed to update status:", err);
        setError("Failed to update status.");
      }
    };

    const throttleUpdate = () => {
      if (locationQueue.current) {
        const { latitude, longitude } = locationQueue.current;
        updateLocationInFirestore(latitude, longitude);
        locationQueue.current = null;
      }
      throttleTimeout.current = null;
    };

    const watcherId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        setCourierData((prev) => ({
          ...prev,
          location: { latitude, longitude },
        }));

        locationQueue.current = { latitude, longitude };

        if (!throttleTimeout.current) {
          throttleTimeout.current = setTimeout(throttleUpdate, 10000);
        }

        // If location access was previously denied, reset error and flag
        if (locationAccessDenied) {
          setLocationAccessDenied(false);
          setError("");
        }
      },
      (err) => {
        console.error("Error watching location:", err);
        setError("Unable to update location.");

        if (err.code === 1) {
          setLocationAccessDenied(true);

          // Only update status if currently active (prevent redundant writes)
          if (courierDataRef.current?.status !== "inactive") {
            updateCourierStatus("inactive");
          }
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watcherId);
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
        throttleTimeout.current = null;
      }
    };
  }, [courierData?.id, locationAccessDenied]);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const ordersDocRef = doc(db, "systemFiles", "restaurantOrders");
        const ordersSnap = await getDoc(ordersDocRef);
        if (ordersSnap.exists()) {
          const data = ordersSnap.data();
          const allOrders = data.restaurantOrders || [];
          setOrders(allOrders);
        } else {
          console.warn("restaurantOrders doc does not exist");
          setOrders([]);
        }
      } catch (err) {
        console.error("Error fetching orders:", err);
      } finally {
        setFetchingOrders(false);
      }
    };

    fetchOrders();
  }, []);

  if (loadingAuth) return <div>Loading authentication...</div>;
  if (!user) return <Navigate to="/login" />;

  return (
  <div className="p-6">
    <h1 className="text-2xl font-bold">
      Welcome, {user.displayName || user.email} (Courier)
    </h1>

    {error && <p className="mt-4 text-red-600">{error}</p>}

    {fetchingCourier ? (
      <p className="mt-4">Checking your courier profile...</p>
    ) : courierData ? (
      <>
        <table className="mt-6 w-full text-left border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Courier ID</th>
              <th className="p-2 border">Name</th>
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Earnings</th>
              <th className="p-2 border">Location</th>
              <th className="p-2 border">Movement Status</th>
              <th className="p-2 border">GPS Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border">{courierData.courierId}</td>
              <td className="p-2 border">{courierData.name}</td>
              <td className="p-2 border">{courierData.email}</td>
              <td className="p-2 border">${courierData.earnings.toFixed(2)}</td>
              <td className="p-2 border">
                {courierData.location?.latitude.toFixed(8)},{" "}
                {courierData.location?.longitude.toFixed(8)}
              </td>
              <td className="p-2 border">{courierData.movementFlag}</td>
              <td className="p-2 border">{courierData.status}</td>
            </tr>
          </tbody>
        </table>

        <hr className="my-8 border-t-2 border-gray-300" />

        <h2 className="text-xl font-semibold mb-4">📝 Task List</h2>

        {fetchingOrders ? (
          <p>Loading tasks…</p>
        ) : orders.length === 0 ? (
          <p>No tasks available.</p>
        ) : (
          <ul className="list-disc list-inside text-gray-600">
            {orders.map((order, idx) => (
              <li key={idx} className="p-4 mb-4 border rounded bg-gray-50">
                <strong>Order ID:</strong> {order.orderId} <br />
                <strong>Status:</strong> {order.deliveryStatus} <br />
                <strong>Items:</strong>
                <ul className="ml-4 list-disc">
                  {order.items.map((item, i) => (
                    <li key={i}>
                      {item.name} × {item.quantity} (prep: {item.prepTime} min)
                    </li>
                  ))}
                </ul>
                <strong>Total Prep Time:</strong> {order.totalPrepTime} min <br />
                <strong>Restaurant Address:</strong> {order.restaurantAddress} <br />
                <strong>User Address:</strong> {order.userAddress}
              </li>
            ))}
          </ul>
        )}
      </>
    ) : null}
  </div>
);
}


/*
TODO
*** 3. show restaurant orders on task list (after preparation time has elapsed)
    4. if courier gps active and accepts (button); car icon appears on user's map
* add phone number
* Better UI -> top right nav is CourierPage user profile link (Name, email, phone* Please complete your user profile before continuing)
                 Job disclosure form: standard procedures/rules - gps tracking; click deliveryStatus buttons; 
                 obligation to select movementFlag updates if waiting; add phoneNumber field

* inactivityTimer: initially set to 0; increases if gps value does not change by a significant amount
* movementFlag: initially set to inactive; set to inactive if inactivityTimer > threshold (10min)
* courier must be within a certain distance to accept a task
* to start a task the courier must press an accept task button -> an enrouteOrder is created in systemFiles
* courier must select deliveryStatus option area when 1. they pick up food from restaurant "in transit" and 2. deliver it to the customer "completed"
                                                      1. restaurantOrder deleted               2. enrouteOrder deleted & completedOrder created + earnings increase
* deliveryStatus: food location is either: 0. "at restaurant" (initial setting), 1. "in transit", or 2. "completed";
                updates systemFiles field delivery status -> enrouteOrders or completedOrders depending on status
* advanced: couriers with multiple tasks are possible [2 people in same area, around same time, order from the same McDonalds]; task gen function in systemFiles restaurant orders

courierId: used by admin to identify the courier on a job task                                                    (essential for job)
currentTask: used by admin to identify if the courier has a task <orderId>                                          [filled / empty]
earnings: 
email: necessary for admin to contact you
inactivityTimer: increases if no significant difference between location coordinates over a period of time, 
                 reset to 0 if courier presses waiting for restaurant, waiting for customer, or movement
location: necessary for inactivity timer calculation
movementFlag: active (moving), inactive (10 min), waiting for restaurant, waiting for customer, need assistance     [active / T]
name: necessary for admin to contact you
phoneNum: necessary for admin to contact you
status: used by admin to identify if the courier has a gps connection                                               [active / T]

Cases: 
1. status = inactive &                                  currentTask = empty  -> currentTasks are unavailable to be added
2. status = inactive &                                  currentTask = filled -> admin will contact (by email and phone number)
3. status = active   & movementFlag = inactive        & currentTask = filled -> admin will contact (by email and phone number)
4. status = active   & movementFlag = need assistance & currentTask = filled -> admin will contact (by email and phone number)

* admin (bot) will reassign the task to restaurant orders, if the current courier (2) has it, and does not respond after msg 
* admin (bot) will reassign the task to restaurant orders, if the current courier (3) has it, and does not respond after msg 
* admin (bot) will create a special assistance task to restaurant orders, if the courier (4) asks for assistance


# Assumes GPS is always dynamic, gps and movement is always tracked
*/