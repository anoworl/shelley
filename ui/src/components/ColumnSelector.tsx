interface GridSelectorProps {
  columns: number;
  rows: number;
  onColumnsChange: (value: number) => void;
  onRowsChange: (value: number) => void;
}

export function GridSelector({ columns, rows, onColumnsChange, onRowsChange }: GridSelectorProps) {
  return (
    <div className="grid-selector">
      <div className="grid-selector-controls">
        {/* Columns */}
        <div className="grid-selector-row">
          <button
            className="grid-selector-btn"
            onClick={() => onColumnsChange(columns - 1)}
            disabled={columns <= 1}
            aria-label="Decrease columns"
          >
            ◀
          </button>
          <span className="grid-selector-value">{columns}</span>
          <button
            className="grid-selector-btn"
            onClick={() => onColumnsChange(columns + 1)}
            aria-label="Increase columns"
          >
            ▶
          </button>
          {/* Columns icon (view-columns) */}
          <svg
            className="grid-selector-direction-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
        </div>
        {/* Rows */}
        <div className="grid-selector-row">
          <button
            className="grid-selector-btn"
            onClick={() => onRowsChange(rows - 1)}
            disabled={rows <= 1}
            aria-label="Decrease rows"
          >
            ◀
          </button>
          <span className="grid-selector-value">{rows}</span>
          <button
            className="grid-selector-btn"
            onClick={() => onRowsChange(rows + 1)}
            aria-label="Increase rows"
          >
            ▶
          </button>
          {/* Rows icon (view-columns rotated 90deg) */}
          <svg
            className="grid-selector-direction-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            style={{ transform: 'rotate(90deg)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
