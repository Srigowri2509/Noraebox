import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";

export default function App() {
  console.log("App component rendering");
  return (
    <div className="min-h-screen w-screen bg-gradient-to-b from-[#f8f0ff] to-[#f2e9ff]">
      <Header />
      <Dashboard />
    </div>
  );
}

