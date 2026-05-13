import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function DataExportSection() {
  return (
    <Card className="bg-surface-elevated border-hairline-strong shadow-sm">
      <CardHeader>
        <CardTitle>Data &amp; export</CardTitle>
        <CardDescription>
          Download your transactions as a CSV file for spreadsheet analysis or backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild>
          <a href="/api/export/transactions" download>
            <Download className="size-4 mr-2" aria-hidden />
            Download transactions CSV
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Includes all transactions across all connected accounts, including
          category overrides. Reflects your most recent sync.
        </p>
      </CardContent>
    </Card>
  );
}
