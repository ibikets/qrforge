"use client";
import { Component, type ReactNode } from "react";

/** The live preview is a convenience. If it ever fails, the editor (and everything typed into it) must stay usable. */
export default class PreviewBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { failed: boolean; key: unknown }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(p: { resetKey: unknown }, s: { failed: boolean; key: unknown }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null; // try again as soon as the card changes
  }
  render() {
    return this.state.failed ? (
      <p role="status" className="rounded-control bg-surface p-4 text-sm text-muted">The preview can’t be shown for the current details. Your edits are safe; keep typing or save the draft.</p>
    ) : this.props.children;
  }
}
