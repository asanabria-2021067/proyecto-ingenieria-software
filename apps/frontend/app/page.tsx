import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesGrid from "@/components/landing/FeaturesGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import IndividualProjectsSection from "@/components/landing/IndividualProjectsSection";
import OrganizationsSection from "@/components/landing/OrganizationsSection";
import CTABanner from "@/components/landing/CTABanner";
import Footer from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <Navbar />
      <HeroSection />
      <FeaturesGrid />
      <HowItWorks />
      <IndividualProjectsSection />
      <OrganizationsSection />
      <CTABanner />
      <Footer />
    </main>
  );
}
