// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminDashboard } from "./AdminDashboard.jsx";

// The forms are stood in for by a single control that marks the page dirty:
// what's under test is the shell's guard, not the forms themselves.
vi.mock("./SocialForm.jsx", () => ({
  SocialForm: ({ onDirtyChange }) => <button onClick={() => onDirtyChange(true)}>Make an edit</button>,
}));
vi.mock("./WebForm.jsx", () => ({ WebForm: () => null }));
vi.mock("./PlanTab.jsx", () => ({ PlanTab: () => null }));
vi.mock("./SubmissionsTab.jsx", () => ({ SubmissionsTab: () => null }));
vi.mock("../../lib/favicon.js", () => ({ setFavicon: () => {} }));

afterEach(cleanup);

function dashboard() {
  const onSignOut = vi.fn();
  render(<AdminDashboard onSignOut={onSignOut} />);
  return onSignOut;
}

describe("AdminDashboard sign out", () => {
  it("signs straight out when nothing is unsaved", () => {
    const onSignOut = dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("asks first when there are unsaved changes, since signing out would drop them", () => {
    const onSignOut = dashboard();
    fireEvent.click(screen.getByText("Make an edit"));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard & continue" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("stays signed in when the edits are kept", () => {
    const onSignOut = dashboard();
    fireEvent.click(screen.getByText("Make an edit"));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("AdminDashboard discard dialog", () => {
  const openDialog = () => {
    fireEvent.click(screen.getByText("Make an edit"));
    fireEvent.change(screen.getByRole("combobox", { name: "Agency" }), { target: { value: "as" } });
  };

  it("starts on the safe choice, so a reflexive Enter keeps the edits", () => {
    dashboard();
    openDialog();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep editing" }));
  });

  it("closes on Escape without discarding anything", () => {
    dashboard();
    openDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Agency" }).value).toBe("isl");
  });
});
