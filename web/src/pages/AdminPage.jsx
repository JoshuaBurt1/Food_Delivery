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
*** some way to access this page (no role, no link in navigation, separate admin login)
*** update system variables here:
~ max searchDistance
~ orderTimeout
~ geolocation update automatic length
~ order timeout update automatic length

shows collection couriers, restaurants, users, systemFiles
shows courier, restaurant manager, and user messages
handles database issues: e.g. courier didn't change the deliveryStatus option and delivered the food
 */