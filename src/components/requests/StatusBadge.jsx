import { CircleCheck, CircleDot, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STATUS = {
  NEW: { label: 'New', variant: 'brand', icon: CircleDot },
  IN_PROGRESS: { label: 'In progress', variant: 'warning', icon: Clock },
  RESOLVED: { label: 'Resolved', variant: 'success', icon: CircleCheck },
};

export default function StatusBadge({ status, size = 'default', className }) {
  const config = STATUS[status] ?? STATUS.NEW;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} size={size} className={className}>
      <Icon />
      {config.label}
    </Badge>
  );
}

export { STATUS as REQUEST_STATUS };
