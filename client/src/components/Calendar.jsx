import { useState, useMemo } from 'react';

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
const DAY_LABELS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DAY_MAP = { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes', 6: 'sabado' };

export default function Calendar({ onSelectDate, selectedDate, availableDays = [], windowDays = 10 }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + windowDays);
    return d;
  }, [today, windowDays]);

  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // Adjust to Monday start (0=Mon, 6=Sun)
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function isEnabled(day) {
    if (!day) return false;
    const date = new Date(viewYear, viewMonth, day);
    date.setHours(0, 0, 0, 0);
    if (date < today) return false;
    if (date > maxDate) return false;
    const dayName = DAY_MAP[date.getDay()];
    return availableDays.includes(dayName);
  }

  function isSelected(day) {
    if (!day || !selectedDate) return false;
    return selectedDate === `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function handleClick(day) {
    if (!isEnabled(day)) return;
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelectDate(dateStr);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const canGoPrev = viewYear > today.getFullYear() || viewMonth > today.getMonth();
  const canGoNext = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-blanco-gris disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          &larr;
        </button>
        <span className="font-semibold text-lg text-negro">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          disabled={!canGoNext}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-blanco-gris disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          &rarr;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gris-medio py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const enabled = isEnabled(day);
          const selected = isSelected(day);
          return (
            <button
              key={i}
              onClick={() => handleClick(day)}
              disabled={!enabled}
              className={`
                h-11 rounded-lg text-sm font-medium transition-all duration-150
                ${selected
                  ? 'bg-azul-acero text-white shadow-sm'
                  : enabled
                    ? 'text-negro hover:bg-azul-acero/10 hover:text-azul-acero cursor-pointer'
                    : 'text-gris-claro cursor-not-allowed'
                }
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
