import { redirect } from 'next/navigation'

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>
}) {
  const { meetingId } = await params
  redirect(`/meetings?meeting=${meetingId}`)
}
