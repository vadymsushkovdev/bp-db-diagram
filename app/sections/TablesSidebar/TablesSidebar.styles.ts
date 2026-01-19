export const styles = {
  sidebar: {
    borderLeft: "1px solid var(--panel-border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--panel-bg)",
  } as React.CSSProperties,

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderBottom: "1px solid var(--panel-border)",
    fontWeight: 700,
  } as React.CSSProperties,

  search: {
    padding: 10,
    borderBottom: "1px solid var(--panel-border)",
  } as React.CSSProperties,

  counter: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.7,
  } as React.CSSProperties,

  list: {
    padding: 10,
    overflow: "auto",
    flex: 1,
  } as React.CSSProperties,

  input: {
    width: "100%",
    height: 34,
    borderRadius: 10,
    border: "1px solid var(--btn-border)",
    background: "var(--btn-bg)",
    color: "var(--text)",
    padding: "0 10px",
    outline: "none",
  } as React.CSSProperties,

  button: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid var(--btn-border)",
    background: "var(--btn-bg)",
    color: "var(--text)",
    cursor: "pointer",
    textAlign: "left",
  } as React.CSSProperties,

  tableButton: {
    border: "1px solid var(--panel-border)",
    borderRadius: 10,
    padding: "8px 10px",
    background: "var(--panel-bg)",
  } as React.CSSProperties,

  splitter: {
    width: 6,
    cursor: "col-resize",
    background: "var(--splitter-bg)",
    borderLeft: "1px solid var(--panel-border)",
  } as React.CSSProperties,

  openButtonRight: {
    position: "absolute",
    right: 10,
    top: 10,
    zIndex: 10,
  } as React.CSSProperties,
};
