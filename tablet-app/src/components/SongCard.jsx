import React from "react";
import SongRow from "./SongRow";

export default function SongCard({ song = {}, onQueue }) {
  return <SongRow song={song} onClick={() => onQueue?.(song)} />;
}
