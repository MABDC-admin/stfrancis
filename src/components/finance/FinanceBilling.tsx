import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, CircleDollarSign, Settings, FileStack } from 'lucide-react';
import { FeeSetupContent } from './FeeSetupContent';
import { AccountStatementsContent } from './AccountStatementsContent';
import { FeeTemplateManager } from './FeeTemplateManager';

export const FinanceBilling = () => {
  const [activeTab, setActiveTab] = useState('statements');

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Billing Management</h1>
            <p className="text-muted-foreground">Manage fees, templates, and student account statements</p>
          </div>
        </div>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3 mb-6">
          <TabsTrigger value="statements" className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4" />
            Account Statements
          </TabsTrigger>
          <TabsTrigger value="fee-setup" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Fee Setup
          </TabsTrigger>
          <TabsTrigger value="fee-templates" className="flex items-center gap-2">
            <FileStack className="h-4 w-4" />
            Fee Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="statements" className="mt-0">
          <AccountStatementsContent />
        </TabsContent>

        <TabsContent value="fee-setup" className="mt-0">
          <FeeSetupContent />
        </TabsContent>

        <TabsContent value="fee-templates" className="mt-0">
          <FeeTemplateManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};
