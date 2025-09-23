import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

export default function OrderPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { restaurantName } = useParams();
  const restaurant = location.state?.restaurant;

  const [quantities, setQuantities] = useState({});
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!restaurant) {
      // If no restaurant is passed, redirect back
      navigate("/user");
    }
  }, [restaurant, navigate]);

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

  const handleSubmitOrder = () => {
    alert(`Order submitted! Total: $${total.toFixed(2)}`);
    navigate("/user");
  };

  if (!restaurant) return <div>Loading...</div>;

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
              <li
                key={index}
                className="border rounded p-4 flex gap-4 items-start shadow-sm"
              >
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
