import { useRef, useState } from 'react';
import { Camera, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface GalleryPhoto {
  id: string;
  image_path: string;
  user_id: string;
}

interface PhotoGalleryProps {
  photos: GalleryPhoto[];
  canDelete: (photo: GalleryPhoto) => boolean;
  // Omitted for signed-out visitors, who can look at the gallery but not
  // contribute to it; the add controls are hidden entirely rather than
  // offered and then refused.
  onAdd?: (file: File) => void | Promise<void>;
  onDelete: (photo: GalleryPhoto) => void;
  uploading: boolean;
}

// The recipe-page "hero": blank by default, becomes a swipeable gallery of
// user-submitted photos of the finished dish once someone adds one.
export function PhotoGallery({ photos, canDelete, onAdd, onDelete, uploading }: PhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAdd = !!onAdd;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAdd?.(file);
    e.target.value = '';
  };

  if (photos.length === 0) {
    return (
      <div className="h-64 bg-slate-800 w-full flex flex-col items-center justify-center gap-3">
        <Camera className="w-10 h-10 text-slate-600" />
        <p className="text-slate-400 text-sm">
          {canAdd ? 'No photos yet — be the first to make it!' : 'No photos of this dish yet.'}
        </p>
        {canAdd && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 text-sm font-semibold bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Add a Photo'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </>
        )}
      </div>
    );
  }

  const index = Math.min(activeIndex, photos.length - 1);
  const active = photos[index];

  return (
    <div className="h-64 bg-slate-800 w-full relative">
      <img src={active.image_path} alt="Photo of the finished dish" className="w-full h-full object-cover" />

      {photos.length > 1 && (
        <>
          <button
            onClick={() => setActiveIndex((i) => (i - 1 + photos.length) % photos.length)}
            title="Previous photo"
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full hover:bg-black/60 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveIndex((i) => (i + 1) % photos.length)}
            title="Next photo"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full hover:bg-black/60 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setActiveIndex(i)}
                title={`Photo ${i + 1}`}
                className={`w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </>
      )}

      <div className="absolute top-6 right-6 flex gap-2">
        {canAdd && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Add a photo"
            className="bg-black/40 text-white p-2.5 rounded-full hover:bg-black/60 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {canDelete(active) && (
          <button
            onClick={() => onDelete(active)}
            title="Remove this photo"
            className="bg-black/40 text-white p-2.5 rounded-full hover:bg-red-600/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {canAdd && (
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      )}
    </div>
  );
}
