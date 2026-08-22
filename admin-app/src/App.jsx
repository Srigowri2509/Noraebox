import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import "./App.css";

export default function App() {
  console.log("App component rendering");
  return (
    <div className="admin-shell min-h-screen w-full bg-gradient-to-b from-[#f8f0ff] to-[#f2e9ff]">
      <Header />
      <Dashboard />
    </div>
  );
}
