import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function orderAge(createdAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function FoodOrdersPanel({ refreshKey = 0 }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const data = await api("/food/orders?active_only=true&limit=100");
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setError("");
    } catch (err) {
      setError(err?.message || "Could not load food orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
    const interval = window.setInterval(loadOrders, 3000);
    return () => window.clearInterval(interval);
  }, [loadOrders, refreshKey]);

  const updateStatus = async (orderId, status) => {
    setUpdatingId(orderId);
    try {
      await api(`/food/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadOrders();
    } catch (err) {
      alert(err?.message || "Could not update the food order.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!loading && !error && orders.length === 0) return null;

  return (
    <section className="food-orders-panel mx-auto mt-8 w-full max-w-[1500px] px-4">
      <div className="overflow-hidden rounded-3xl border border-orange-200 bg-white/90 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-orange-500 to-amber-400 px-6 py-4 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-100">Room service</p>
            <h2 className="text-2xl font-extrabold">Food orders</h2>
          </div>
          <span className="rounded-full bg-white/20 px-4 py-2 text-sm font-bold">{orders.length} active</span>
        </div>
        {error ? <p className="m-5 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700">{error}</p> : null}
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <article key={order.id} className={`rounded-2xl border p-5 shadow-sm ${order.status === "preparing" ? "border-blue-300 bg-blue-50" : "border-orange-200 bg-orange-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">{order.room_name || "Room"}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{orderAge(order.created_at)} · {order.status}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-lg font-extrabold text-orange-700 shadow-sm">{money(order.total_amount)}</span>
              </div>
              <ul className="mt-4 space-y-2">
                {(order.items || []).map((item, index) => (
                  <li key={`${item.item_id}-${index}`} className="flex items-start justify-between gap-3 text-sm text-slate-800">
                    <span className="font-semibold">{item.name}{item.seasoning_name ? ` — ${item.seasoning_name}` : ""}</span>
                    <span className="font-extrabold">×{item.quantity}</span>
                  </li>
                ))}
              </ul>
              {order.notes ? <p className="mt-4 rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-700"><strong>Note:</strong> {order.notes}</p> : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" disabled={updatingId === order.id} onClick={() => updateStatus(order.id, "served")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">Delivered</button>
                <button type="button" disabled={updatingId === order.id} onClick={() => updateStatus(order.id, "cancelled")} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">Cancel</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
