import { useEffect } from "react";

import { StartScreen } from "./components/StartScreen";
import { WalkScreen } from "./components/WalkScreen";
import { useTheme } from "./lib/useTheme";
import { useWander } from "./lib/useWander";

export default function App() {
  const wander = useWander();
  const { theme, choice, setChoice } = useTheme();
  const walking = wander.phase === "running";

  // Warn before a reload throws away an in-progress walk.
  useEffect(() => {
    if (!walking) return;
    const guard = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [walking]);

  if (walking) {
    return (
      <WalkScreen
        {...wander}
        theme={theme}
        themeChoice={choice}
        setThemeChoice={setChoice}
      />
    );
  }

  return (
    <StartScreen
      areas={wander.areas}
      phase={wander.phase}
      progress={wander.progress}
      error={wander.error}
      onStart={wander.start}
    />
  );
}
