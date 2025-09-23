import { useEffect, useState } from "react";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { auth, db } from "../firebase";

export default function OrderPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { restaurantId } = useParams();
  const restaurant = location.state?.restaurant;

  const [quantities, setQuantities] = useState({});
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState(null);
  const [userData, setUserData] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // SINGLE auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      setAuthChecked(true);

      if (user) {
        setUserId(user.uid);
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserData(userSnap.data());
        } else {
          console.warn("No user document found");
        }
      } else {
        navigate("/login");
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Redirect if no restaurant
  useEffect(() => {
    if (!restaurant) {
      navigate("/user");
    }
  }, [restaurant, navigate]);

  // Calculate total price
  useEffect(() => {
    if (!restaurant?.menu) return;
    const newTotal = restaurant.menu.reduce((acc, item, idx) => {
      if (item.available) {
        const qty = quantities[idx] || 0;
        acc += item.price * qty;
      }
      return acc;
    }, 0);
    setTotal(newTotal);
  }, [quantities, restaurant]);

  const handleQuantityChange = (index, value) => {
    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty < 0) return;

    setQuantities((prev) => ({
      ...prev,
      [index]: qty,
    }));
  };

  const handleSubmitOrder = async () => {
    if (total === 0) {
      alert("Please add at least one item to your order.");
      return;
    }

    try {
      const restaurantOrdersRef = doc(db, "systemFiles", "restaurantOrders");
      const docSnap = await getDoc(restaurantOrdersRef);

      if (!docSnap.exists()) {
        alert("Order system not initialized.");
        return;
      }

      const data = docSnap.data();
      const existingOrders = data.restaurantOrders || [];

      const items = Object.entries(quantities)
        .filter(([idx, qty]) => qty > 0 && restaurant.menu[idx])
        .map(([idx, qty]) => ({
          name: restaurant.menu[idx].name,
          quantity: qty,
        }));

      const newOrder = {
        createdAt: Timestamp.now(),
        deliveryStatus: "at restaurant",
        items,
        orderId: `${restaurantId}_${existingOrders.length + 1}`,
        restaurantId,
        userId,
      };

      await updateDoc(restaurantOrdersRef, {
        restaurantOrders: [...existingOrders, newOrder],
      });

      navigate("/payment", {
        state: {
          total,
          restaurantName: restaurant.storeName,
          items,
        },
      });
    } catch (error) {
      console.error("Error submitting order:", error);
      alert("There was an error processing your order. Please try again.");
    }
  };

  // Prevent premature rendering
  if (!authChecked || !restaurant) return <div>Loading...</div>;
  if (!userId) return null;

  const availableMenu = restaurant.menu?.filter(item => item.available) || [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        Order from {restaurant.storeName}
      </h1>

      {availableMenu.length === 0 ? (
        <p>No menu items available.</p>
      ) : (
        <form onSubmit={(e) => {
          e.preventDefault();
          handleSubmitOrder();
        }}>
          <ul className="space-y-4">
            {availableMenu.map((item, index) => (
              <li key={index} className="border rounded p-4 flex gap-4 items-start shadow-sm">
                {item.imgUrl && (
                  <img
                    src={item.imgUrl}
                    alt={item.name}
                    style={{ width: "100px", height: "100px", objectFit: "cover" }}
                    className="rounded"
                  />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold">{item.name}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                  <p className="text-sm text-gray-500">Calories: {item.calories}</p>
                  <p className="text-sm font-medium mb-2">${item.price.toFixed(2)}</p>
                  <input
                    type="number"
                    min="0"
                    className="w-24 border px-2 py-1 rounded"
                    value={quantities[index] || ""}
                    onChange={(e) => handleQuantityChange(index, e.target.value)}
                    placeholder="Qty"
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 text-right">
            <p className="text-lg font-bold mb-2">Total: ${total.toFixed(2)}</p>
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Pay & Submit
            </button>
          </div>
        </form>
      )}
    </div>
  );
}



/*
*** 2. pass the prepTime field to the new restaurantOrder
* fix: orderNumber
* payment split between: 
~ Restaurant:	        Food revenue (minus platform commission)
~ Delivery Driver:	    Delivery fee + tip (via platform)
~ Platform (Delivery):	Commission + service fees
* If the store is closed, orders cannot be placed
*/