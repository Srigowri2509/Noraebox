export default function VideoPlayer({ src, isPlaying, onEnded }) {
  return (
    <video
      src={src}
      autoPlay={isPlaying}
      onEnded={onEnded}
      playsInline
      muted={false}
      className="w-full h-full object-cover bg-rose-300"
    />
  );
}
