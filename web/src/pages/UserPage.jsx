import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, addDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Navigate } from "react-router-dom";

export default function UserPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState([]);
  const [userData, setUserData] = useState(null);
  const [fetchingUser, setFetchingUser] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

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
            data.name?.toLowerCase().trim() === user.displayName?.toLowerCase().trim();
          return emailMatch || nameMatch;
        });

        if (matchedDoc) {
          setUserData({ id: matchedDoc.id, ...matchedDoc.data() });
          setFetchingUser(false);
          return;
        }

        const newUser = {
          email: user.email,
          name: user.displayName || "Unnamed User",
          createdAt: new Date(),
          status: "pending-setup",
        };

        const docRef = await addDoc(usersRef, newUser);
        await updateDoc(docRef, { userId: docRef.id });

        setUserData({ id: docRef.id, userId: docRef.id, ...newUser });
        setFetchingUser(false);
      } catch (err) {
        console.error("Error fetching or creating user:", err);
        setError("Something went wrong while setting up your user profile.");
        setFetchingUser(false);
      }
    };

    fetchOrCreateUser();
  }, [user]);

  useEffect(() => {
    if (user) {
      (async () => {
        const snap = await getDocs(collection(db, "restaurants"));
        setRestaurants(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })();
    }
  }, [user]);

  if (loading || fetchingUser) return <div>Loading...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Welcome, {user.displayName} (User)</h1>
      <h2 className="mt-4 text-xl">Nearby Restaurants</h2>
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
* a form to set up and update other user information
* ensure all users have same fields

User can select multiple restaurants.
On restaurant selection, food item choice selection

Message system to admin team if excessive wait time
Status updates from system (admin has contacted courier, admin has changed courier, estimated wait time)
System updates from courier (waiting for restaurant, assistance button pressed)
*/