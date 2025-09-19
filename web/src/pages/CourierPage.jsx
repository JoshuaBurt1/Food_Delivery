import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
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
              name: user.displayName || "Unnamed Courier",
              earnings: 0,
              location: new GeoPoint(latitude, longitude),
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

  if (loadingAuth) return <div>Loading authentication...</div>;
  if (!user) return <Navigate to="/login" />;

  const toggleStatus = () => {
    if (!courierData?.id || locationAccessDenied) return;
    updateCourierStatus(courierData.status === "active" ? "inactive" : "active");
  };

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
                <th className="p-2 border">Status</th>
                <th className="p-2 border">Location</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border">{courierData.courierId}</td>
                <td className="p-2 border">{courierData.name}</td>
                <td className="p-2 border">{courierData.email}</td>
                <td className="p-2 border">${courierData.earnings.toFixed(2)}</td>
                <td className="p-2 border">{courierData.status}</td>
                <td className="p-2 border">
                  {courierData.location?.latitude.toFixed(8)},{" "}
                  {courierData.location?.longitude.toFixed(8)}
                </td>
              </tr>
            </tbody>
          </table>

          {!locationAccessDenied && (
            <div className="mt-6">
              <button
                onClick={toggleStatus}
                className={`px-4 py-2 rounded text-white ${
                  courierData.status === "active"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                Set Status to {courierData.status === "active" ? "Inactive" : "Active"}
              </button>
            </div>
          )}

          <hr className="my-8 border-t-2 border-gray-300" />

          <h2 className="text-xl font-semibold mb-4">📝 Task List</h2>

          <ul className="list-disc list-inside text-gray-600">
            <li className="italic text-gray-400">No tasks assigned yet.</li>
          </ul>
        </>
      ) : null}
    </div>
  );
}
