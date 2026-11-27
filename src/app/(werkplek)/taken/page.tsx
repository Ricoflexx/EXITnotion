import { myTasks } from "@/lib/databases";
import { requireUser } from "@/lib/session";
import { TaskList } from "@/components/TaskList";

export const metadata = { title: "Mijn taken" };

/** Mijn taken (R35) en de dagelijkse To Do (R36), met slimme lijsten zoals in TickTick. */
export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await myTasks(user);
  return (
    <article className="page">
      <h1 className="title-input">Mijn taken</h1>
      <p className="muted">Je eigen To Do, plus alles waar je bij een taak in een gedeelde database bent toegevoegd.</p>
      <TaskList tasks={tasks} />
    </article>
  );
}
