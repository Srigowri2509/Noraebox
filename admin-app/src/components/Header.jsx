export default function Header() {
  return (
    <header className="admin-header w-full flex items-center bg-white/70 backdrop-blur-md border-b border-purple-200 shadow-sm">
      <h1 className="admin-header__title font-semibold text-purple-800 tracking-wide">
        <span className="admin-header__brand">Norebox Admin</span>
        <span className="admin-header__subtitle">Room Monitoring</span>
      </h1>
    </header>
  );
}
