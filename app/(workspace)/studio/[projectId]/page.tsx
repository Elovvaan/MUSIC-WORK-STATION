import { StudioPage } from "@/components/studio/studio-page";
export default function Page({ params }: { params: { projectId: string } }) { const { projectId } = params; return <StudioPage projectId={projectId} />; }
