import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore";

export default function RestaurantPage() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [restaurantData, setRestaurantData] = useState(null);
  const [fetchingRestaurant, setFetchingRestaurant] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

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
          email: user.email,
          name: user.displayName || "Unnamed Restaurant",
          createdAt: new Date(),
          status: "pending-setup", // example status
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
      <p className="mt-2 text-gray-600">Restaurant ID: {restaurantData?.restaurantId}</p>
      {/* You can add more restaurant dashboard components here */}
    </div>
  );
}


/*
*** a form to set up and update restaurant manager information (ensure all restaurant managers have same fields)
*** Restaurant manager logs in and updates menu.

Later: Can view collection systemFiles, restaurantOrders for their restaurantId only (to make food)
Later: Can view collection systemFiles, enrouteOrders for their restaurantId only (to confirm courierId on pick-up)

Advanced: Restaurant has to accept the order for it to be processed -> refund user if not accepted
Advanced: the reason orders are in systemFiles and not restaurant:
1. the number of restaurantOrders, enrouteOrders, completedOrders could get very large -> large document
2. restaurantOrders & enrouteOrders array are constantly added to / deleted keeping it a managable size
3. completedOrders is the only "infinite" size document, rarely accessed. Can be ordered and searched quickly by createdAt date, courierId, restaurantId, userId.
# these could be broken up further to reduce size (one restaurantOrders/enrouteOrders/completedOrders per restuarant); collection within a document

# validity of address is "enforced" by the restaurant manager wanting sales. Advanced: further enforced by a courier message to admin if unable to access site.
*/