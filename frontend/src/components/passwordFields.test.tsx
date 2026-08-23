import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "./PasswordInput";
import { PasswordMatch } from "./PasswordMatch";

describe("PasswordInput", () => {
  it("reveals and hides the password without submitting the form", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="Password" defaultValue="a test password" />
      </form>,
    );

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(input.type).toBe("password");
    expect(toggle).toHaveAttribute("type", "button");

    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("keeps the reveal control in the keyboard tab order", () => {
    render(<PasswordInput aria-label="Password" />);

    expect(screen.getByRole("button", { name: "Show password" })).not.toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});

describe("PasswordMatch", () => {
  it("stays silent until confirmation starts", () => {
    const { container } = render(
      <PasswordMatch password="a test password" confirmPassword="" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("announces matching and mismatching values", () => {
    const { rerender } = render(
      <PasswordMatch password="a test password" confirmPassword="a typo" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Passwords do not match");

    rerender(
      <PasswordMatch password="a test password" confirmPassword="a test password" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Passwords match");
  });
});
