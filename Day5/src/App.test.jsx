import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { initialBooks } from "./libraryData";

afterEach(cleanup);

describe("library lending view", () => {
  it("shows loading before the catalog arrives and then displays availability and overdue reminders", async () => {
    const loadLibrary = () => new Promise((resolve) => {
      window.setTimeout(() => resolve(initialBooks), 20);
    });
    render(<App loadLibrary={loadLibrary} />);

    expect(screen.getByRole("status").textContent).toContain("Loading your library");
    expect(await screen.findByText("2 available")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Overdue reminder" }).textContent).toContain("Kindred");
  });

  it("shows an empty-catalog state when there are no books", async () => {
    render(<App loadLibrary={() => Promise.resolve([])} />);

    expect(await screen.findByText("No books in the catalog yet.")).toBeTruthy();
  });

  it("reports a catalog failure and lets the member retry successfully", async () => {
    const loadLibrary = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(initialBooks);
    render(<App loadLibrary={loadLibrary} />);

    expect((await screen.findByRole("alert")).textContent).toContain("couldn’t load the catalog");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("2 available")).toBeTruthy();
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });

  it("updates the hold count locally and allows the member to cancel their hold", async () => {
    render(<App loadLibrary={() => Promise.resolve(initialBooks)} />);

    fireEvent.click(await screen.findByRole("button", { name: "Place a hold for Kindred" }));
    expect(screen.getByText("4 readers waiting")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel hold for Kindred" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel hold for Kindred" }));
    await waitFor(() => expect(screen.getByText("3 readers waiting")).toBeTruthy());
  });
});
