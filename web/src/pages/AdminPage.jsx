import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase"; // adjust path as needed

export default function AdminPage() {
  const [timeoutValue, setTimeoutValue] = useState(10000); // how often the client checks for order timeout
  const [orderAutoRejectTime, setOrderAutoRejectTime] = useState(10); // after how many minutes to auto-reject an order
  const [maxRestaurantSearchDistance, setMaxRestaurantSearchDistance] = useState(100); // km
  const [maxCourierSearchDistance, setMaxCourierSearchDistance] = useState(50); // km
  const [courierTaskAvailabilityTime, setCourierTaskAvailabilityTime] = useState(30); // seconds
  const [geoUpdateInterval, setGeoUpdateInterval] = useState(10000); // ms
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage("");

    try {
      await setDoc(
        doc(db, "systemFiles", "systemVariables"),
        {
          timeoutValue: timeoutValue,
          orderAutoRejectTime: orderAutoRejectTime,
          maxRestaurantSearchDistance,
          maxCourierSearchDistance,
          courierTaskAvailabilityTime,
          geoUpdateInterval,
        },
        { merge: true }
      );
      setMessage("All variables saved successfully.");
    } catch (error) {
      console.error("Error saving variables:", error);
      setMessage("Failed to save system variables.");
    }

    setSaving(false);
  };

  return (
    <div>
      <h1>Admin Settings</h1>

      <label>
        Timeout Value (ms) – Client Refresh Interval:
        <input
          type="number"
          min="1000"
          step="1000"
          value={timeoutValue}
          onChange={(e) => setTimeoutValue(Number(e.target.value))}
        />
      </label>

      <br />

      <label>
        Order Auto Reject Time (minutes):
        <input
          type="number"
          min="1"
          value={orderAutoRejectTime}
          onChange={(e) => setOrderAutoRejectTime(Number(e.target.value))}
        />
      </label>

      <br />

      <label>
        Max Restaurant Search Distance (km):
        <input
          type="number"
          min="1"
          value={maxRestaurantSearchDistance}
          onChange={(e) => setMaxRestaurantSearchDistance(Number(e.target.value))}
        />
      </label>

      <br />

      <label>
        Max Courier Search Distance (km):
        <input
          type="number"
          min="1"
          value={maxCourierSearchDistance}
          onChange={(e) => setMaxCourierSearchDistance(Number(e.target.value))}
        />
      </label>

      <br />

      <label>
        Courier Task Availability Time (seconds):
        <input
          type="number"
          min="1"
          value={courierTaskAvailabilityTime}
          onChange={(e) => setCourierTaskAvailabilityTime(Number(e.target.value))}
        />
      </label>

      <br />

      <label>
        Geolocation Update Interval (ms):
        <input
          type="number"
          min="1000"
          step="1000"
          value={geoUpdateInterval}
          onChange={(e) => setGeoUpdateInterval(Number(e.target.value))}
        />
      </label>

      <br /><br />

      <button onClick={handleSaveAll} disabled={saving}>
        {saving ? "Saving..." : "Save All Variables"}
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}


/*

* SYSTEM VARIABLES SHOULD BE UPDATED HERE
~ maxRestaurantSearchDistance <- (currently hardcoded Math.min(radius, [100]) in UserPage.jsx)
~ maxCourierSearchDistance <- (currently hardcoded as distKm <= [50] in RestaurantPage.jsx)
~ courierTaskAvailabilityTime <- (courier's time range to click accept or reject)
~ geoUpdateInterval <- (currently hardcoded as setTimeout(throttleUpdate, 10000) in CourierPage.jsx)
~ timeoutValue : refresh time in client restaurantPage for order timeout update <- (currently hardcoded as }, 10000); in RestaurantPage.jsx); should be automatic in server
~ orderAutoRejectTime: <- (currently hardcoded as const timeoutMinutes = timeoutValue ?? 10; in OrderPage.jsx)

* some way to access this page (no role, no link in navigation, separate admin login)

* access to collection couriers, restaurants, users, systemFiles (variables and messages)
* handles database issues: e.g. courier didn't change the deliveryStatus option and delivered the food
 */