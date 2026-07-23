import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadFoto } from './upload-foto';

describe('UploadFoto', () => {
  let component: UploadFoto;
  let fixture: ComponentFixture<UploadFoto>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadFoto],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadFoto);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
