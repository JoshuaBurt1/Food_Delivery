import { Navigate, useNavigate } from "react-router-dom";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "../firebase";

export default function Login({ role }) {
  const navigate = useNavigate();

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      console.log("User is:", auth.currentUser);
      console.log("Role is:", role);
      navigate(`/${role}`);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  // This handles missing role properly during initial render
  if (!role) return <Navigate to="/" />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Login as {role}</h1>
      <button
        onClick={login}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
      >
        Sign in with Google
      </button>
    </div>
  );
}
