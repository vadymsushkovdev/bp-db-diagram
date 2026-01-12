export const styles = {
  sidebar: {
    borderRight: "1px solid var(--panel-border)",
    display: "flex",
    flexDirection: "column",
  } as React.CSSProperties,

  header: {
    padding: 10,
    fontWeight: 600,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid var(--panel-border)",
  } as React.CSSProperties,

  button: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--btn-border)",
    background: "var(--btn-bg)",
    color: "var(--text)",
    cursor: "pointer",
  } as React.CSSProperties,

  select: {
    height: 32,
    padding: "0 10px",
    borderRadius: 8,
    border: "1px solid var(--btn-border)",
    background: "var(--btn-bg)",
    color: "var(--text)",
    cursor: "pointer",
    outline: "none",
  } as React.CSSProperties,

  splitter: {
    width: 6,
    cursor: "col-resize",
    background: "var(--splitter-bg)",
    borderRight: "1px solid var(--panel-border)",
  } as React.CSSProperties,

  openButton: {
    position: "absolute",
    left: 10,
    top: 10,
    zIndex: 10,
  } as React.CSSProperties,
};
