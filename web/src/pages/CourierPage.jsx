import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  GeoPoint,
} from "firebase/firestore";

export default function CourierPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [courierData, setCourierData] = useState(null);
  const [fetchingCourier, setFetchingCourier] = useState(true);
  const [error, setError] = useState("");

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  // Firestore lookup and optional creation
  useEffect(() => {
    const fetchOrCreateCourier = async () => {
      if (!user) return;

      try {
        const couriersRef = collection(db, "couriers");

        // Look for existing courier
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
        } else {
          // ✅ No match — create new courier profile
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords;

              const newCourier = {
                email: user.email,
                name: user.displayName || "Unnamed Courier",
                courierId: Math.floor(1000 + Math.random() * 9000).toString(), // random 4-digit ID
                earnings: 0,
                location: new GeoPoint(latitude, longitude),
                status: "active",
              };

              const docRef = await addDoc(couriersRef, newCourier);
              setCourierData({ id: docRef.id, ...newCourier });
            },
            (err) => {
              console.error("Location error", err);
              setError("Location access denied. Cannot create profile.");
            }
          );
        }

        setFetchingCourier(false);
      } catch (err) {
        console.error("Error fetching or creating courier:", err);
        setError("Something went wrong.");
        setFetchingCourier(false);
      }
    };

    if (user) fetchOrCreateCourier();
  }, [user]);

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
          {/* Courier table */}
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
                  {courierData.location?.latitude.toFixed(4)},{" "}
                  {courierData.location?.longitude.toFixed(4)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Page break */}
          <hr className="my-8 border-t-2 border-gray-300" />

          {/* Task List heading */}
          <h2 className="text-xl font-semibold mb-4">📝 Task List</h2>

          {/* Empty list placeholder */}
          <ul className="list-disc list-inside text-gray-600">
            <li className="italic text-gray-400">No tasks assigned yet.</li>
          </ul>
        </>
      ) : null}
    </div>
  );
}
