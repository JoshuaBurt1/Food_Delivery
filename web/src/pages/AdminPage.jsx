import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase"; // adjust path to your Firebase config

export default function AdminPage() {
  const [timeoutMinutes, setTimeoutMinutes] = useState(5); // default 5
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSaveTimeout = async () => {
    setSaving(true);
    setMessage("");

    try {
      await setDoc(
        doc(db, "systemFiles", "systemVariables"),
        { timeoutValue: timeoutMinutes },
        { merge: true } // Don't overwrite other fields
      );
      setMessage("Timeout value saved successfully.");
    } catch (error) {
      console.error("Error saving timeout value:", error);
      setMessage("Failed to save timeout value.");
    }

    setSaving(false);
  };

  return (
    <div>
      <h1>Admin Settings</h1>

      <label>
        Timeout Value (minutes):
        <input
          type="number"
          min="1"
          value={timeoutMinutes}
          onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
        />
      </label>

      <button onClick={handleSaveTimeout} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}


/*
* some way to access this page (no role, no link in navigation, separate admin login)

* SYSTEM VARIABLES SHOULD BE UPDATED HERE
~ maxRestaurantSearchDistance <- (currently hardcoded Math.min(radius, [100]) in UserPage.jsx)
~ maxCourierSearchDistance <- (currently hardcoded as distKm <= [50] in RestaurantPage.jsx)
~ courierTaskAvailabilityTime <- (courier's time range to click accept or reject)
~ geolocation update automatic length <- (currently hardcoded as setTimeout(throttleUpdate, 10000) in CourierPage.jsx)
~ timeoutValue : order timeout update automatic length  <- (currently hardcoded as }, 10000); in RestaurantPage.jsx)

* access to collection couriers, restaurants, users, systemFiles (variables and messages)
* handles database issues: e.g. courier didn't change the deliveryStatus option and delivered the food
 */