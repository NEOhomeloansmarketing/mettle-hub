import { redirect } from 'next/navigation'

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>
}) {
  const { taskId } = await params
  redirect(`/tasks?task=${taskId}`)
}
