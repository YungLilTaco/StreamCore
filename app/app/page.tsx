import Link from "next/link";
import { BookOpen, MousePointerClick, Wand2 } from "lucide-react";
import { AppPage } from "@/components/app/AppPage";

export default function AppHome() {
  return (
    <AppPage
      title="Welcome to StreamCore"
      description="This is your in-app home: quick orientation, what each page does, and how to get value fast."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Tile
          icon={<MousePointerClick className="h-4 w-4" />}
          title="Navigation"
          text="Use the left menu to open tools. Pages won’t auto-switch while scrolling."
        />
        <Tile
          icon={<Wand2 className="h-4 w-4" />}
          title="Start here"
          text="Set up your overlays + bot first — then add music requests and alerts."
        />
        <Tile
          icon={<BookOpen className="h-4 w-4" />}
          title="Need help?"
          text={
            <>
              Jump into <Link className="text-white underline underline-offset-4" href="/app/overlay-editor">Overlay editor</Link>{" "}
              to see the next steps.
            </>
          }
        />
      </div>

      <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
        Tip: Click <span className="font-semibold text-white">StreamCore</span> in the top bar anytime to return to
        this home page.
      </div>
    </AppPage>
  );
}

function Tile({
  icon,
  title,
  text
}: {
  icon: React.ReactNode;
  title: string;
  text: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <div className="mt-2 text-sm leading-relaxed text-white/65">{text}</div>
    </div>
  );
}

