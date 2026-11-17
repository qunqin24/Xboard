import { ContentSection } from "../components/content-section";
import { AppearanceForm } from "./appearance-form";

export function SettingsAppearance() {
    return (
        <ContentSection
            title="外观"
            desc="调整主题和字体。也可以在右上角的界面设置里调整侧边栏和布局。"
        >
            <AppearanceForm />
        </ContentSection>
    );
}
