import Link from "next/link";

interface Project {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  thumbnailUrl: string | null;
  updatedAt: Date;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-600",
  PROCESSING: "bg-yellow-600",
  COMPLETE: "bg-green-600",
  FAILED: "bg-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  "2D_PLAN": "2D Plan",
  "3D_MODEL": "3D Model",
  FULL_CONVERSION: "Full Conversion",
};

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/editor/${project.id}`}
      className="group block rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-700 transition overflow-hidden"
    >
      <div className="aspect-video bg-gray-800 flex items-center justify-center">
        {project.thumbnailUrl ? (
          <img
            src={project.thumbnailUrl}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl opacity-30">🏠</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`w-2 h-2 rounded-full ${STATUS_COLORS[project.status] || "bg-gray-600"}`}
          />
          <span className="text-xs text-gray-500">
            {TYPE_LABELS[project.type] || project.type}
          </span>
        </div>
        <h3 className="text-sm font-medium text-white group-hover:text-blue-400 transition truncate">
          {project.title}
        </h3>
        {project.description && (
          <p className="text-xs text-gray-500 mt-1 truncate">
            {project.description}
          </p>
        )}
        <p className="text-xs text-gray-600 mt-2">
          Updated {new Date(project.updatedAt).toLocaleDateString()}
        </p>
      </div>
    </Link>
  );
}
