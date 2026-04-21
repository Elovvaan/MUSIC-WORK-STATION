import { StudioPage } from "@/components/studio/studio-page";
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <StudioPage projectId={projectId} />; }
