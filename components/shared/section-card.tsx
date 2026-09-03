import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

interface SectionCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * A consistently-styled section container for dashboard and feature pages.
 * Provides visual grouping with optional title, description, action button, and footer.
 */
export function SectionCard({
  title,
  description,
  action,
  footer,
  children,
  className,
}: SectionCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description && (
            <CardDescription className="mt-0.5 text-xs">
              {description}
            </CardDescription>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}
