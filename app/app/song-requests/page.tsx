import { AppPage } from "@/components/app/AppPage";
import { SongRequestsClient } from "./song-requests-client";

export default function Page() {
  return (
    <AppPage
      title="Song requests"
      description="Queue management, permissions, and Spotify integration for chat-driven requests."
    >
      <SongRequestsClient />
    </AppPage>
  );
}

