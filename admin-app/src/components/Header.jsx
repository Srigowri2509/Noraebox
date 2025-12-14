export default function Header() {
  return (
    <header
      className="
        w-full h-16 
        flex items-center 
        px-10
        bg-white/70 
        backdrop-blur-md 
        border-b border-purple-200
        shadow-sm
      "
    >
      <h1 className="text-3xl font-semibold text-purple-800 tracking-wide">
        Admin Dashboard — Room Monitoring
      </h1>
    </header>
  );
}
