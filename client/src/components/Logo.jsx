export default function Logo({ className = '' }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <svg width="180" height="48" viewBox="0 0 180 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="32" fontFamily="Work Sans, sans-serif" fontWeight="600" fontSize="22" fill="#1A1A17">
          Daniel MacLean
        </text>
        <text x="0" y="46" fontFamily="Work Sans, sans-serif" fontWeight="300" fontSize="11" fill="#A4A4A6" letterSpacing="2">
          PSICOTERAPIA
        </text>
      </svg>
    </div>
  );
}
