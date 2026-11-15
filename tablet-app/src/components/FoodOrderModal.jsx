import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function QuantityControl({ quantity, onDecrease, onIncrease }) {
  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-white/10 bg-black/25">
      <button type="button" disabled={!quantity} onClick={onDecrease} className="flex h-8 w-9 items-center justify-center text-lg text-slate-200 transition hover:bg-white/10 disabled:opacity-25">−</button>
      <span className="w-8 text-center text-sm font-extrabold tabular-nums text-white">{quantity}</span>
      <button type="button" onClick={onIncrease} className="flex h-8 w-9 items-center justify-center bg-purple-500/25 text-lg text-purple-100 transition hover:bg-purple-500/45">+</button>
    </div>
  );
}

function MenuItem({ item, quantity, seasoning, seasoningOptions, onSeasoningChange, onDecrease, onIncrease }) {
  const priceLabel = item.price ? money(item.price) : item.kind === "drink" ? "Paid" : item.kind === "dip" ? "Free" : "Included";
  return (
    <article className={`food-menu-item-card ${quantity ? "food-menu-item-card--selected" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-xl">{item.emoji || "🍽️"}</div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-bold text-white sm:text-base">{item.name}</h4>
          <p className={`text-sm font-extrabold ${item.price || item.kind === "drink" ? "text-amber-300" : "text-emerald-300"}`}>{priceLabel}</p>
        </div>
        <QuantityControl quantity={quantity} onDecrease={onDecrease} onIncrease={onIncrease} />
      </div>
      {item.supports_seasoning ? (
        <div className="food-seasoning-row">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Seasoning</span>
          <div className="food-seasoning-options">
            {seasoningOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={seasoning === option.id}
                onClick={() => onSeasoningChange(option.id)}
                className={`food-seasoning-option ${seasoning === option.id ? "food-seasoning-option--active" : ""}`}
              >
                {option.name}{option.price ? ` +${money(option.price)}` : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

const FALLBACK_MENU = {
  items: [
    { id: "veg-burger", name: "Veg Burger", emoji: "🍔", price: 200, supports_seasoning: false },
    { id: "double-veg-burger", name: "Double Veg Burger", emoji: "🍔", price: 250, supports_seasoning: false },
    { id: "aloo-burger", name: "Aloo Burger", emoji: "🍔", price: 200, supports_seasoning: false },
    { id: "double-aloo-burger", name: "Double Aloo Burger", emoji: "🍔", price: 250, supports_seasoning: false },
    { id: "paneer-burger", name: "Paneer Burger", emoji: "🍔", price: 250, supports_seasoning: false },
    { id: "french-fries", name: "French Fries", emoji: "🍟", price: 140, supports_seasoning: true },
    { id: "garlic-potato-shots", name: "Garlic Potato Shots", emoji: "🥔", price: 140, supports_seasoning: true },
    { id: "cheese-balls", name: "Cheese Balls", emoji: "🧀", price: 170, supports_seasoning: true },
    { id: "veg-nuggets", name: "Veg Nuggets", emoji: "🟤", price: 170, supports_seasoning: true },
    { id: "paneer-sticks", name: "Paneer Sticks", emoji: "🥢", price: 190, supports_seasoning: true },
  ],
  seasonings: [
    { id: "classic-salt", name: "Classic Salt", price: 0 },
    { id: "peri-peri", name: "Peri Peri", price: 0 },
    { id: "cheese-loaded", name: "Cheese Drizzle", price: 0 },
  ],
  dips: [
    { id: "mayonnaise", name: "Mayonnaise", emoji: "🥣", price: 0 },
    { id: "cheese-dip", name: "Cheese Dip", emoji: "🧀", price: 0 },
    { id: "ketchup", name: "Ketchup", emoji: "🥫", price: 0 },
  ],
  drinks: [
    { id: "coke", name: "Coke", emoji: "🥤", price: 50 },
    { id: "diet-coke", name: "Diet Coke", emoji: "🥤", price: 60 },
    { id: "sprite", name: "Sprite", emoji: "🥤", price: 50 },
    { id: "thums-up", name: "Thums Up", emoji: "🥤", price: 50 },
  ],
};

export default function FoodOrderModal({ open, roomId, reminder = false, onClose }) {
  const [menu, setMenu] = useState({ items: [], seasonings: [], dips: [], drinks: [] });
  const [quantities, setQuantities] = useState({});
  const [seasonings, setSeasonings] = useState({});
  const [activeCategory, setActiveCategory] = useState("burgers");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeOrder, setActiveOrder] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    api("/food/menu")
      .then((data) => setMenu({
        items: Array.isArray(data?.items) ? data.items : [],
        seasonings: Array.isArray(data?.seasonings) ? data.seasonings : [],
        dips: Array.isArray(data?.dips) ? data.dips : [],
        drinks: Array.isArray(data?.drinks) ? data.drinks : [],
      }))
      .catch(() => {
        // The menu is bundled so customers can still browse it while an older
        // backend version is being upgraded. Order submission remains server validated.
        setMenu(FALLBACK_MENU);
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (open) setActiveCategory("burgers");
  }, [open]);

  useEffect(() => {
    if (!roomId) return;
    const storageKey = `active_food_order:${roomId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored?.id && !["served", "cancelled"].includes(stored.status)) {
        setActiveOrder(stored);
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [roomId, open]);

  useEffect(() => {
    if (!roomId || !activeOrder?.id) return undefined;
    const storageKey = `active_food_order:${roomId}`;
    let cancelled = false;

    const refreshStatus = async () => {
      try {
        const response = await api(`/food/orders/${activeOrder.id}`);
        const order = response?.order;
        if (!order || cancelled) return;
        if (["served", "cancelled"].includes(order.status)) {
          localStorage.removeItem(storageKey);
          setActiveOrder(null);
          return;
        }
        localStorage.setItem(storageKey, JSON.stringify(order));
        setActiveOrder(order);
      } catch {
        // Keep the last known preparing state during a temporary network issue.
      }
    };

    const interval = window.setInterval(refreshStatus, 3000);
    void refreshStatus();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeOrder?.id, roomId]);

  const allRows = useMemo(
    () => [
      ...menu.items.map((item) => ({ ...item, kind: "food" })),
      ...menu.dips.map((item) => ({ ...item, kind: "dip", supports_seasoning: false })),
      ...menu.drinks.map((item) => ({ ...item, kind: "drink", supports_seasoning: false })),
    ],
    [menu]
  );

  const sections = useMemo(() => [
    { id: "burgers", title: "Burgers", icon: "🍔", items: menu.items.filter((item) => !item.supports_seasoning) },
    { id: "snacks", title: "Snacks", icon: "🍟", items: menu.items.filter((item) => item.supports_seasoning) },
    { id: "dips", title: "Dips", icon: "🥣", items: menu.dips.map((item) => ({ ...item, kind: "dip", supports_seasoning: false })) },
    { id: "drinks", title: "Drinks", icon: "🥤", items: menu.drinks.map((item) => ({ ...item, kind: "drink", supports_seasoning: false })) },
  ].filter((section) => section.items.length), [menu]);

  const activeSection = sections.find((section) => section.id === activeCategory) || sections[0];

  const total = useMemo(
    () => allRows.reduce((sum, item) => {
      const quantity = Number(quantities[item.id] || 0);
      const selectedSeasoning = menu.seasonings.find(
        (option) => option.id === (seasonings[item.id] || "classic-salt")
      );
      return sum + quantity * (Number(item.price || 0) + Number(selectedSeasoning?.price || 0));
    }, 0),
    [allRows, menu.seasonings, quantities, seasonings]
  );

  const itemCount = Object.values(quantities).reduce((sum, quantity) => sum + Number(quantity || 0), 0);

  const changeQuantity = (id, delta) => {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(20, Number(current[id] || 0) + delta)),
    }));
    setError("");
  };

  const submitOrder = async () => {
    const items = allRows
      .filter((item) => Number(quantities[item.id] || 0) > 0)
      .map((item) => ({
        item_id: item.id,
        quantity: Number(quantities[item.id]),
        seasoning_id: item.supports_seasoning
          ? seasonings[item.id] || "classic-salt"
          : null,
      }));
    if (!roomId) {
      setError("This tablet is not assigned to a room.");
      return;
    }
    if (!items.length) {
      setError("Choose at least one item.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await api("/food/orders", {
        method: "POST",
        body: JSON.stringify({ room_id: roomId, items }),
      });
      const order = response?.order || { total_amount: total, status: "preparing" };
      setActiveOrder(order);
      if (roomId && order.id) {
        localStorage.setItem(`active_food_order:${roomId}`, JSON.stringify(order));
      }
      setQuantities({});
      setSeasonings({});
    } catch (err) {
      setError(err?.message || "Could not place the order.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-labelledby="food-order-title" onClick={onClose}>
      <section className="food-order-modal flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.75rem] border border-purple-400/25 bg-[#0a0814] shadow-[0_28px_100px_rgba(0,0,0,0.75)]" onClick={(event) => event.stopPropagation()}>
        <header className="food-order-modal-header flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[linear-gradient(110deg,rgba(88,28,135,.72),rgba(15,23,42,.96))]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">{reminder ? "Hungry? Order something" : "Room service"}</p>
            <h2 id="food-order-title" className="mt-0.5 text-xl font-extrabold text-white sm:text-2xl">Menu</h2>
            <p className="truncate text-xs text-slate-300 sm:text-sm">Pick what you want and send the order to the admin team.</p>
          </div>
          <button type="button" onClick={onClose} className="food-menu-close" aria-label="Close food menu">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="food-menu-close-icon">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {activeOrder ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-10 text-center">
            <div className="text-6xl">🍳</div>
            <p className="mt-5 rounded-full border border-amber-300/30 bg-amber-400/10 px-5 py-2 text-sm font-extrabold uppercase tracking-[0.16em] text-amber-300">Preparing</p>
            <h3 className="mt-4 text-3xl font-bold text-white">Your order is being prepared</h3>
            <p className="mt-2 text-lg text-slate-300">This status will update when the admin marks it delivered.</p>
            <p className="mt-4 rounded-full bg-white/[0.06] px-5 py-2 font-bold text-slate-200">Total: {money(activeOrder.total_amount)}</p>
            <button type="button" onClick={onClose} className="mt-8 rounded-full bg-white/10 px-8 py-3 font-bold text-white hover:bg-white/15">Close</button>
          </div>
        ) : (
          <>
            <nav className="food-menu-tabs flex shrink-0 overflow-x-auto border-b border-white/10 bg-[#0d0a18]" aria-label="Menu categories">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveCategory(section.id)}
                  className={`food-menu-tab food-menu-tab--${section.id} ${activeSection?.id === section.id ? "food-menu-tab--active" : ""}`}
                >
                  <span>{section.icon}</span>
                  <span>{section.title}</span>
                </button>
              ))}
            </nav>
            <div className="food-order-modal-body min-h-0 flex-1 overflow-y-auto">
              {loading ? <p className="py-16 text-center text-lg text-purple-200">Loading menu…</p> : null}
              {!loading && activeSection ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {activeSection.items.map((item) => (
                    <MenuItem
                      key={item.id}
                      item={item}
                      quantity={Number(quantities[item.id] || 0)}
                      seasoning={seasonings[item.id] || "classic-salt"}
                      seasoningOptions={menu.seasonings}
                      onSeasoningChange={(seasoningId) => setSeasonings((current) => ({ ...current, [item.id]: seasoningId }))}
                      onDecrease={() => changeQuantity(item.id, -1)}
                      onIncrease={() => changeQuantity(item.id, 1)}
                    />
                  ))}
                </div>
              ) : null}
              {error ? <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{error}</p> : null}
            </div>
            <footer className="food-order-modal-footer flex shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-[#100d1d]/98">
              <div className="flex items-baseline gap-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{itemCount} item{itemCount === 1 ? "" : "s"}</p><p className="text-2xl font-extrabold text-white">{money(total)}</p></div>
              <button type="button" disabled={submitting || !itemCount} onClick={submitOrder} className="food-order-submit">{submitting ? "Sending…" : "Place order"}</button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
