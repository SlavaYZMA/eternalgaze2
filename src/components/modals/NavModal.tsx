import { X } from 'lucide-react';

interface NavModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

const NavModal = ({ isOpen, onClose, children, title }: NavModalProps) => {
  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6
        bg-black/95 transition-opacity duration-200
        ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
      `}
      onClick={onClose}
    >
      <div
        className="bg-black border border-white/10 max-w-2xl w-full max-h-[85vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-black border-b border-white/10 p-4 md:p-6 flex items-center justify-between">
          <h2 className="text-sm md:text-base tracking-[0.2em] text-white/90 font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
};

export default NavModal;
