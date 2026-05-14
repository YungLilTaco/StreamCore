import { AppPage } from "@/components/app/AppPage";
import { StreamCoreBotClient } from "./streamcore-bot-client";

export default function Page() {
  return (
    <AppPage
      title="StreamCore bot"
      description="StreamCoreHelper — manage chat commands, bot runtime settings, and the song request queue from one place."
    >
      <StreamCoreBotClient />
    </AppPage>
  );
}
