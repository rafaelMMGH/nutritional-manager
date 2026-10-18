/// <reference types="react/canary" />
import * as React from "react";

type Props = React.ComponentProps<typeof React.ViewTransition>;

// Next 15 ships React's <ViewTransition> as `unstable_ViewTransition` in the experimental build it
// switches to when `experimental.viewTransition` is on. Without it, render the children unchanged.
const Native = (React as unknown as { unstable_ViewTransition?: React.ComponentType<Props> }).unstable_ViewTransition;

export function ViewTransition(props: Props) {
  return Native ? <Native {...props} /> : <>{props.children}</>;
}
