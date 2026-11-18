import { ContentSection } from "../components/content-section";
import { AppearanceForm } from "./appearance-form";

export function SettingsAppearance() {
    return (
        <ContentSection
            title="外观"
            help="侧边栏与布局可在顶栏「界面设置」中调整。"
        >
            <AppearanceForm />
        </ContentSection>
    );
}
