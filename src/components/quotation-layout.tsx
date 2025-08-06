
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where } from 'firebase/firestore';
import { db, auth, googleProvider } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';

import type { Quotation, QuotationWithId } from '@/types';
import { defaultHeaderImage } from '@/lib/default-header-image';

import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import QuotationSidebar from '@/components/quotation-sidebar';
import QuoteGenerator from '@/components/quote-generator';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import Loader from './ui/loader';


const defaultQuotationValues: Quotation = {
  companyName: "DARSHAN ENTERPRISES",
  companyAddress: "A-29, Radhey Krishna Recidency Nr. Glorious School, Valia Road GIDC Ankleshwar, Dist- Bharuch (Guj) 393001",
  companyEmail: "cheharmata@rediffmail.com",
  companyPhone: "9998016708",
  customerName: "",
  customerAddress: "",
  kindAttention: "",
  quoteName: "",
  quoteDate: new Date(),
  lineItems: [{ description: "", quantity: undefined, unit: "pcs", rate: undefined, showQuantity: true, showUnit: true, showRate: true }],
  terms: `1. Subject to be Ankleshwar Juriduction.\n2. Payment 50% Advance and 50% After work Completed.\n3. Work started with in 4 days after receiving of work order.\n4. GST Extra 18% (24BCVPP7836H1ZW).\n5. Without Advance I am not agree for Work.`,
  authorisedSignatory: "Mata Prasad Prajapati",
  headerImage: defaultHeaderImage,
};

export default function QuotationLayout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [quotations, setQuotations] = useState<QuotationWithId[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFormLoading, setIsFormLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [quotationToDelete, setQuotationToDelete] = useState<string | null>(null);
  

  const activeId = searchParams.get('id');

  const showLoader = useCallback((duration: number) => {
    setIsFormLoading(true);
    setTimeout(() => {
      setIsFormLoading(false);
    }, duration);
  }, []);

  useEffect(() => {
    showLoader(700);
  }, [activeId, showLoader]);

  useEffect(() => {
    if (!auth) {
      setIsInitialLoading(false);
      setIsFormLoading(false);
      return;
    }
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        currentUser.getIdToken().then((idToken) => {
            const credential = GoogleAuthProvider.credential(idToken);
        });
      } else {
        setQuotations([]);
        setIsInitialLoading(false);
        setAccessToken(null);
        if (activeId) router.push('/');
        else setIsFormLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, [router, activeId]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'quotations'), 
      where('userId', '==', user.uid), 
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const quotesData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          quoteDate: data.quoteDate?.toDate(),
        } as QuotationWithId;
      });
      setQuotations(quotesData);
      setIsInitialLoading(false);
      if(isFormLoading) {
         setTimeout(() => setIsFormLoading(false), 500); 
      }
    }, (error) => {
      console.error("Error fetching quotations:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch quotations from the database.",
      });
      setIsInitialLoading(false);
      setIsFormLoading(false);
    });

    return () => unsubscribe();
  }, [user, toast, isFormLoading]);

  const activeQuotation = useMemo(() => {
    if (!user) {
      return { ...defaultQuotationValues, userId: '' };
    } 
    if (!activeId) {
      return { ...defaultQuotationValues, userId: user.uid };
    }
    const found = quotations.find(q => q.id === activeId);
    return found ? { ...found } : { ...defaultQuotationValues, userId: user.uid };
  }, [activeId, quotations, user]);

  const handleSave = async (data: Quotation) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Not signed in', description: 'You must be signed in to save quotations.' });
        return;
    }
    setIsSaving(true);
    let docId = activeId;
    try {
      const dataToSave = {
        ...data,
        quoteDate: data.quoteDate,
        userId: user.uid,
      };

      if (activeId && quotations.some(q => q.id === activeId)) {
        const quoteRef = doc(db, 'quotations', activeId);
        await updateDoc(quoteRef, {
          ...dataToSave,
          updatedAt: serverTimestamp(),
        });
      } else {
        const docRef = await addDoc(collection(db, 'quotations'), {
          ...dataToSave,
          createdAt: serverTimestamp(),
        });
        docId = docRef.id;
        showLoader(500);
        router.push(`/?id=${docId}`);
      }
      return docId ?? undefined;
    } catch (error) {
      console.error("Error saving quotation: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save quotation.",
      });
      return undefined;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setQuotationToDelete(id);
  };
  
  const confirmDelete = async () => {
    if (!quotationToDelete) return;
    
    try {
      await deleteDoc(doc(db, 'quotations', quotationToDelete));
      toast({ title: "Deleted", description: "Quotation has been deleted." });
      if (activeId === quotationToDelete) {
        router.push('/');
      }
    } catch (error) {
      console.error("Error deleting document: ", error);
       toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete quotation.",
      });
    } finally {
      setQuotationToDelete(null);
    }
  };
  
  const handleSignIn = async () => {
    if (!auth) return;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        setAccessToken(credential.accessToken || null);
      }
    } catch (error) {
        console.error("Error signing in: ", error);
        toast({ variant: "destructive", title: "Sign-in Failed", description: "Could not sign in with Google." });
    }
  };

  const handleSignOut = async () => {
      if (!auth) return;
      try {
          await signOut(auth);
      } catch (error) {
          console.error("Error signing out: ", error);
          toast({ variant: "destructive", title: "Sign-out Failed", description: "Could not sign out." });
      }
  };

  const handleNewQuotation = () => {
    showLoader(500);
    router.push('/');
  };


  if (isInitialLoading && !user) {
      return <div className="flex h-screen w-full items-center justify-center"><Loader /></div>;
  }

  return (
    <>
    <SidebarProvider>
      <QuotationSidebar
        quotations={quotations}
        activeId={activeId}
        onDelete={handleDeleteRequest}
        onNew={handleNewQuotation}
        isLoading={isInitialLoading}
        isUserLoggedIn={!!user}
      />
      <SidebarInset>
        <div className="flex flex-col h-svh">
            <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
                <SidebarTrigger className="md:hidden"/>
                <div className="flex-1">
                    <h1 className="text-xl md:text-2xl font-semibold">
                        DE Quotation Generator
                    </h1>
                </div>
                <div>
                  {user ? (
                     <DropdownMenu>
                       <DropdownMenuTrigger asChild>
                         <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                           <Avatar>
                             <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
                             <AvatarFallback>
                               <UserIcon />
                             </AvatarFallback>
                           </Avatar>
                         </Button>
                       </DropdownMenuTrigger>
                       <DropdownMenuContent className="w-56" align="end">
                         <DropdownMenuLabel className='font-normal'>
                           <div className="flex flex-col space-y-1">
                             <p className="text-sm font-medium leading-none">{user.displayName}</p>
                             <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                           </div>
                         </DropdownMenuLabel>
                         <DropdownMenuSeparator />
                         <DropdownMenuItem onClick={handleSignOut}>
                           <LogOut className="mr-2" />
                           Sign Out
                         </DropdownMenuItem>
                       </DropdownMenuContent>
                     </DropdownMenu>
                  ) : (
                    <Button onClick={handleSignIn} variant="outline">
                      <LogIn className="mr-2"/>
                      Sign In
                    </Button>
                  )}
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 relative">
                {isFormLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Loader />
                  </div>
                )}
                <div className="max-w-screen-2xl mx-auto">
                    {!user ? (
                      <div className="text-center py-20">
                        <h2 className="text-2xl font-semibold mb-4">Welcome!</h2>
                        <p className="text-muted-foreground mb-6">Please sign in to create and manage your quotations.</p>
                        <Button size="lg" onClick={handleSignIn}>
                          <LogIn className="mr-2"/>
                          Sign In with Google
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="text-muted-foreground mb-8 max-w-3xl">
                            Create, edit, and manage professional quotations. Your changes are saved when you click the save button.
                        </p>
                        <QuoteGenerator
                            key={activeId || 'new'}
                            initialData={activeQuotation}
                            onSave={handleSave}
                            isSaving={isSaving}
                            accessToken={accessToken}
                        />
                      </>
                    )}
                </div>
            </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
    <AlertDialog open={!!quotationToDelete} onOpenChange={(open) => !open && setQuotationToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this quotation.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setQuotationToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
